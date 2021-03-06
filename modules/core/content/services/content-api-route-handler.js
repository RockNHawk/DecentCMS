// DecentCMS (c) 2014 Bertrand Le Roy, under MIT. See LICENSE.txt for licensing details.
'use strict';

/**
 * @description
 * This handler registers itself as an Express middleware that handles
 * a catchall route with a relatively low priority, for content API.
 */
var ContentApiRouteHandler = {
  service: 'middleware',
  feature: 'content-api',
  routePriority: 8000,
  scope: 'shell',
  /**
   * Registers the default content API middleware.
   * * `/api/src/` in front of a content item id gets its document source.
   * * `/api/shapes/` in front of a content item is gets the processed shape for it.
   * @param {object} scope The scope.
   * @param {object} context The context.
   * @param {object} context.expressApp The Express application object.
   */
  register: function registerContentApiMiddleware(scope, context) {
    var shapeHelper = scope.require('shape');
    context.expressApp.register(ContentApiRouteHandler.routePriority, function bindContentMiddleware(app) {
      app.get('/api/src(/*)?', function contentSrcMiddleware(request, response, next) {
        if (request.routed) {
          next();
          return;
        }
        var id = request.path === '/api/src'
          ? '/' : require('querystring').unescape(request.path.substr(9));
        response.type('json');
        if (request.debug) {
          request.app.set('json spaces', 2);
        }
        if (id) {
          var storage = request.require('storage-manager');
          storage.promiseToGet(id);
          storage.fetchContent({request: request}, function (err) {
            if (err) {
              response.status(500);
              response.json({error: err});
              next(err);
              return;
            }
            var item = storage.getAvailableItem(id);
            if (item) {
              response.json(shapeHelper.copy(item));

              request.routed = true;
              request.handled = true;
              next();
            }
            else {
              response.status(404);
              response.json({error: 'Not found'});

              request.routed = true;
              request.handled = true;
              next();
            }
          });
        }
      });
      app.get('/api/shapes(/*)?', function contentShapeMiddleware(request, response, next) {
        if (request.routed) {
          next();
          return;
        }
        var id = request.path === '/api/shapes'
          ? '/' : require('querystring').unescape(request.path.substr(12));
        response.type('json');
        if (request.debug) {
          request.app.set('json spaces', 2);
        }
        if (id) {
          var storage = request.require('storage-manager');
          storage.promiseToGet(id);
          storage.fetchContent({request: request}, function (err) {
            if (err) {
              response.status(500);
              response.json({error: err});
              next(err);
              return;
            }
            var item = storage.getAvailableItem(id);
            if (item) {
              scope.callService('part-loader', 'load', {
                scope: scope,
                item: item
              }, function () {
                var shape = {
                  meta: {type: 'content'},
                  temp: {item: item, shapes: []}
                };
                request.callService('shape-handler', 'handle', {
                  scope: request,
                  shape: shape
                }, function renderShapeJson(err) {
                  if (err) {
                    response.status(500);
                    response.json({error: err});
                    next(err);
                    return;
                  }
                  var shapes = shape.temp.shapes;
                  var result = {};
                  shapes.forEach(function removeTempItem(shape) {
                    delete shape.temp;
                    if (shape.meta) {
                      result[shape.meta.name] = shape;
                    }
                  });
                  // Send the serialized list of shapes.
                  response.json(shapeHelper.copy(result));
  
                  request.routed = true;
                  request.handled = true;
                  next();
                });
                });
            }
            else {
              response.status(404);
              response.json({error: 'Not found'});

              request.routed = true;
              request.handled = true;
              next();
            }
          });
        }
      });
    });
  }
};

module.exports = ContentApiRouteHandler;