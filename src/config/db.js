const { PrismaClient } = require('@prisma/client');

const globalForPrisma = global;

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

const connectDatabase = async () => {
  await prisma.$connect();
};

const disconnectDatabase = async () => {
  await prisma.$disconnect();
};

module.exports = {
  prisma,
  connectDatabase,
  disconnectDatabase
};
