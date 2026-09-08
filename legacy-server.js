const Module = require("module");
const originalLoad = Module._load;
const realExpress = require("express");

Module._load = function(request, parent, isMain) {
  if (request !== "express") return originalLoad.apply(this, arguments);

  function patchedExpress(...args) {
    const app = realExpress(...args);
    const originalPost = app.post.bind(app);

    app.post = function(route, ...handlers) {
      if (route === "/api/message" && handlers.length >= 2) {
        const originalAuth = handlers[0];

        handlers[0] = function guestOptionalAuth(req, res, next) {
          const auth = req.headers.authorization || "";
          const token = auth.startsWith("Bearer ")
            ? auth.slice(7).trim()
            : req.headers["x-session-token"];

          if (!token) {
            req.user = {
              user_id: "guest",
              username: "guest"
            };
            req.session = null;

            if (req.body && typeof req.body === "object") {
              req.body.memory = [];
              req.body.project_context = "";
            }

            return next();
          }

          return originalAuth(req, res, next);
        };

        return originalPost(route, ...handlers);
      }

      return originalPost(route, ...handlers);
    };

    return app;
  }

  Object.assign(patchedExpress, realExpress);
  return patchedExpress;
};

require("./legacy-server.js");
