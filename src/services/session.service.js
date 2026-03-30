const { Prisma } = require('@prisma/client');

const { prisma } = require('../config/db');
const { getStripeClient } = require('../config/stripe');
const {
  createError,
  serializeParkingSpot,
  serializeParkingSession,
  buildBlockingSessionWhere,
  getBlockingSessionForSpot
} = require('./parking.service');
const { buildPredictionForSpot } = require('./prediction.service');
const { emitParkingEvent, scheduleHeatmapBroadcast } = require('../sockets/parking.socket');

const getClientUrl = () => {
  if (!process.env.CLIENT_URL) {
    throw createError(500, 'CLIENT_URL is not configured.');
  }

  return process.env.CLIENT_URL.replace(/\/$/, '');
};

const getReservationExpiryDate = (now = new Date()) => {
  const holdMinutes = Number(process.env.PARKING_SESSION_HOLD_MINUTES || 30);
  return new Date(now.getTime() + holdMinutes * 60 * 1000);
};

const buildSessionPayload = async (spotId, session, options = {}) => {
  const now = options.now || new Date();
  const spot = await prisma.parkingSpot.findUnique({
    where: {
      id: spotId
    },
    include: {
      sessions: {
        where: buildBlockingSessionWhere(now),
        orderBy: {
          createdAt: 'desc'
        }
      }
    }
  });

  if (!spot) {
    return null;
  }

  const blockingSession = getBlockingSessionForSpot(spot.sessions, now);
  const prediction = await buildPredictionForSpot(spot.id, {
    spot,
    now,
    persist: options.persistPrediction !== false
  });

  return {
    spot: serializeParkingSpot(spot, {
      blockingSession,
      now
    }),
    session: session ? serializeParkingSession(session) : blockingSession ? serializeParkingSession(blockingSession) : null,
    prediction,
    timestamp: now
  };
};

const emitSessionAvailability = async ({ spotId, session, eventName, persistPrediction = true, now }) => {
  const payload = await buildSessionPayload(spotId, session, {
    persistPrediction,
    now
  });

  if (!payload) {
    return null;
  }

  emitParkingEvent('parking:update', payload);

  if (eventName) {
    emitParkingEvent(eventName, payload);
  }

  scheduleHeatmapBroadcast();

  return payload;
};

const releaseSpotIfUnblocked = async (tx, spotId, excludedSessionId, now = new Date()) => {
  const blockingCount = await tx.parkingSession.count({
    where: {
      spotId,
      id: excludedSessionId
        ? {
            not: excludedSessionId
          }
        : undefined,
      ...buildBlockingSessionWhere(now)
    }
  });

  if (blockingCount === 0) {
    await tx.parkingSpot.update({
      where: {
        id: spotId
      },
      data: {
        isAvailable: true
      }
    });

    return true;
  }

  return false;
};

const cleanupExpiredPendingSessions = async (spotId) => {
  const now = new Date();
  const expiredSessions = await prisma.parkingSession.findMany({
    where: {
      status: 'pending',
      expiresAt: {
        lte: now
      },
      ...(spotId ? { spotId } : {})
    }
  });

  for (const expiredSession of expiredSessions) {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.parkingSession.findUnique({
        where: {
          id: expiredSession.id
        }
      });

      if (!current || current.status !== 'pending') {
        return null;
      }

      const updatedSession = await tx.parkingSession.update({
        where: {
          id: current.id
        },
        data: {
          status: 'expired',
          endTime: now
        }
      });

      const released = await releaseSpotIfUnblocked(tx, current.spotId, current.id, now);

      return {
        session: updatedSession,
        released
      };
    });

    if (result?.released) {
      await emitSessionAvailability({
        spotId: expiredSession.spotId,
        session: result.session,
        eventName: 'parking:available',
        persistPrediction: false,
        now
      });
    }
  }
};

const reserveSpotForCheckout = async (spotId, now) => {
  await cleanupExpiredPendingSessions(spotId);

  return prisma.$transaction(
    async (tx) => {
      const spot = await tx.parkingSpot.findUnique({
        where: {
          id: spotId
        }
      });

      if (!spot) {
        throw createError(404, 'Parking spot not found.');
      }

      const blockingCount = await tx.parkingSession.count({
        where: {
          spotId,
          ...buildBlockingSessionWhere(now)
        }
      });

      if (blockingCount > 0 || !spot.isAvailable) {
        throw createError(409, 'Parking spot is currently unavailable for booking.');
      }

      const updatedSpots = await tx.parkingSpot.updateMany({
        where: {
          id: spotId,
          isAvailable: true
        },
        data: {
          isAvailable: false
        }
      });

      if (updatedSpots.count !== 1) {
        throw createError(409, 'Parking spot was booked by another request.');
      }

      const pendingSession = await tx.parkingSession.create({
        data: {
          spotId: spot.id,
          amountPaid: spot.pricePerHour,
          status: 'pending',
          expiresAt: getReservationExpiryDate(now)
        }
      });

      return {
        spot,
        pendingSession
      };
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable
    }
  );
};

const cancelPendingReservation = async (sessionId) => {
  if (!sessionId) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    const session = await tx.parkingSession.findUnique({
      where: {
        id: sessionId
      }
    });

    if (!session || session.status !== 'pending') {
      return;
    }

    await tx.parkingSession.update({
      where: {
        id: session.id
      },
      data: {
        status: 'cancelled',
        endTime: new Date()
      }
    });

    await releaseSpotIfUnblocked(tx, session.spotId, session.id, new Date());
  });
};

const createCheckoutSession = async ({ spotId }) => {
  const now = new Date();
  const stripe = getStripeClient();
  const clientUrl = getClientUrl();
  const { spot, pendingSession } = await reserveSpotForCheckout(spotId, now);

  try {
    const expiresAt = Math.floor(new Date(pendingSession.expiresAt).getTime() / 1000);
    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'payment',
      client_reference_id: String(pendingSession.id),
      success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl}/payment/cancel?parkingSessionId=${pendingSession.id}&spotId=${spot.id}`,
      expires_at: expiresAt,
      payment_method_types: ['card'],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(Number(spot.pricePerHour) * 100),
            product_data: {
              name: `Parking Session For Spot #${spot.id}`,
              description: `${spot.streetName} ${spot.type} parking at $${Number(spot.pricePerHour).toFixed(2)} per session`
            }
          }
        }
      ],
      metadata: {
        spotId: String(spot.id),
        parkingSessionId: String(pendingSession.id),
        streetName: spot.streetName
      }
    });

    const updatedSession = await prisma.parkingSession.update({
      where: {
        id: pendingSession.id
      },
      data: {
        stripeSessionId: checkoutSession.id
      }
    });

    await emitSessionAvailability({
      spotId: spot.id,
      session: updatedSession,
      eventName: null,
      persistPrediction: false,
      now
    });

    return {
      message: 'Stripe checkout session created successfully.',
      parkingSession: serializeParkingSession(updatedSession),
      checkoutUrl: checkoutSession.url
    };
  } catch (error) {
    await cancelPendingReservation(pendingSession.id);
    throw createError(502, `Unable to create Stripe checkout session: ${error.message}`);
  }
};

const activateParkingSession = async (stripeCheckoutSession) => {
  const stripeSessionId = stripeCheckoutSession.id;
  const amountPaid = Number((stripeCheckoutSession.amount_total || 0) / 100);
  const now = new Date();

  const activation = await prisma.$transaction(async (tx) => {
    const session = await tx.parkingSession.findFirst({
      where: {
        OR: [
          {
            stripeSessionId
          },
          {
            id: Number(stripeCheckoutSession.metadata?.parkingSessionId || 0)
          }
        ]
      }
    });

    if (!session) {
      throw createError(404, `No parking session found for Stripe session ${stripeSessionId}.`);
    }

    if (session.status === 'active' || session.status === 'completed') {
      return {
        session,
        shouldEmit: false
      };
    }

    if (session.status !== 'pending') {
      return {
        session,
        shouldEmit: false
      };
    }

    const updatedSession = await tx.parkingSession.update({
      where: {
        id: session.id
      },
      data: {
        status: 'active',
        startTime: session.startTime || now,
        stripeSessionId,
        amountPaid: amountPaid || session.amountPaid
      }
    });

    await tx.parkingSpot.update({
      where: {
        id: session.spotId
      },
      data: {
        isAvailable: false
      }
    });

    return {
      session: updatedSession,
      shouldEmit: true
    };
  });

  if (activation.shouldEmit) {
    await emitSessionAvailability({
      spotId: activation.session.spotId,
      session: activation.session,
      eventName: 'parking:occupied',
      persistPrediction: true,
      now
    });
  }

  return activation.session;
};

const expireParkingSession = async (stripeCheckoutSession, nextStatus) => {
  const stripeSessionId = stripeCheckoutSession.id;
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.parkingSession.findFirst({
      where: {
        stripeSessionId
      }
    });

    if (!session || session.status !== 'pending') {
      return null;
    }

    const updatedSession = await tx.parkingSession.update({
      where: {
        id: session.id
      },
      data: {
        status: nextStatus,
        endTime: now
      }
    });

    const released = await releaseSpotIfUnblocked(tx, session.spotId, session.id, now);

    return {
      session: updatedSession,
      released
    };
  });

  if (result?.released) {
    await emitSessionAvailability({
      spotId: result.session.spotId,
      session: result.session,
      eventName: 'parking:available',
      persistPrediction: false,
      now
    });
  }

  return result?.session || null;
};

const endParkingSession = async (sessionId) => {
  const now = new Date();
  await cleanupExpiredPendingSessions();

  const result = await prisma.$transaction(async (tx) => {
    const session = await tx.parkingSession.findUnique({
      where: {
        id: sessionId
      }
    });

    if (!session) {
      throw createError(404, 'Parking session not found.');
    }

    if (session.status !== 'active') {
      throw createError(409, 'Only active parking sessions can be completed.');
    }

    const updatedSession = await tx.parkingSession.update({
      where: {
        id: session.id
      },
      data: {
        status: 'completed',
        endTime: now
      }
    });

    await releaseSpotIfUnblocked(tx, session.spotId, session.id, now);

    return updatedSession;
  });

  await emitSessionAvailability({
    spotId: result.spotId,
    session: result,
    eventName: 'parking:available',
    persistPrediction: true,
    now
  });

  return {
    message: 'Parking session completed successfully.',
    parkingSession: serializeParkingSession(result)
  };
};

module.exports = {
  cleanupExpiredPendingSessions,
  createCheckoutSession,
  activateParkingSession,
  expireParkingSession,
  endParkingSession
};
