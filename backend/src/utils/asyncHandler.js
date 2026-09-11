// Express 4 doesn't automatically catch a rejected promise inside an async
// route handler — without this wrapper, a thrown error (missing API key,
// bad file, failed AI call, etc.) just hangs the request or resets the
// connection, which the frontend then reports as a vague network error.
// Wrapping every async controller in this ensures errors reach the global
// error handler in server.js and come back as clean JSON instead.
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
