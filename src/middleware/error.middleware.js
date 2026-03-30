const notFoundHandler = (request, _response, next) => {
  const error = new Error(`Route ${request.method} ${request.originalUrl} not found.`);
  error.status = 404;
  next(error);
};

const errorHandler = (error, _request, response, _next) => {
  const status = error.status || 500;

  response.status(status).json({
    error: {
      message: error.message || 'Internal server error.',
      status
    }
  });
};

module.exports = {
  notFoundHandler,
  errorHandler
};
