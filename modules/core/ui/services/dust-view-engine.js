// DecentCMS (c) 2014 Bertrand Le Roy, under MIT. See LICENSE.txt for licensing details.
'use strict';

/**
 * @description
 * A view engine using Dust templates.
 * http://akdubya.github.io/dustjs/
 * https://github.com/linkedin/dustjs/wiki/Dust-Tutorial
 *
 * The view engine exposes by default the standard helpers:
 * https://github.com/linkedin/dustjs-helpers
 *
 * Helpers
 * =======
 *
 * T
 * -
 * Makes the enclosed string localizable.
 *
 * ```
 *     {@t}Text to localize{/t}
 * ```
 * 
 * Shape
 * -----
 * It adds a 'shape' helper that enables the rendering of
 * DecentCMS shapes. The shape helper takes a 'shape' parameter
 * that should point to the shape object to render.
 * Optional parameters are tag and class.
 *
 * ```
 *     {@shape shape=footer tag="footer" class="main-footer"/}
 * ```
 * 
 * Style
 * -----
 * Registers a style sheet.
 * Use the non-minimized name, without extension, as the name parameter.
 *
 * ```
 *     {@style name="style"/}
 * ```
 * 
 * Styles
 * ------
 * Renders the list of registered styles.
 *
 * ```
 *     {@styles/}
 * ```
 * 
 * Script
 * ------
 * Registers a script.
 * Use the non-minimized name, without extension, as the name parameter.
 *
 * ```
 *     {@script name="//ajax.googleapis.com/ajax/libs/jquery/1.11.0/jquery.js"/}
 * ```
 * 
 * Scripts
 * -------
 * Renders the list of registered scripts.
 *
 * ```
 *     {@scripts/}
 * ```
 * 
 * Meta
 * ----
 * Registers a meta tag.
 * name: the name of the tag
 * value: the value of the tag (rendered as the content attribute)
 * Additional attributes will be rendered as-is.
 *
 *     {@meta name="generator" value="DecentCMS"/}
 *
 * Metas
 * -----
 * Renders registered meta tags.
 *
 * ```
 *     {@metas/}
 * ```
 *
 * Date
 * ----
 * Formats a date using the Luxon library.
 * value: the date to format.
 * format: the format string to use (see <https://moment.github.io/luxon/docs/manual/formatting.html> for reference).
 *
 * ```
 *      {@date format/}
 * ```
 * 
 * Dump
 * ----
 * A filter to pretty-print an object, skipping its 'temp' property.
 * This is particularly useful to dump the current content and debug templates.
 * 
 * ```
 *      {meta|dump|s}
 *      {.|dump|s}
 * ```
 * 
 * Note: you may need to install Node with full ICU support, in order
 * to format with locales other than 'en-US'.
 * 
 * Plain
 * -----
 * A filter that removes tags and newlines from an HTML source.
 * 
 * ```
 *      {body.html|plain}
 * ```
 * 
 * First Paragraph
 * ---------------
 * A filter that extracts the plain text from the first paragraph from an HTML string,
 * or all the text before a `<--more-->` tag.
 * 
 * ```
 *      {body.html|firstp}
 * ```
 */
var DustViewEngine = function DustViewEngine(scope) {
  this.scope = scope;

  var RenderStream = require('./render-stream');
  var dust = require('dustjs-linkedin');
  dust.config.whitespace = !!scope.debug;
  dust.helper = require('dustjs-helpers');
  var DateTime = require('luxon').DateTime;
  var pretty = require('js-object-pretty-print').pretty;
  var shapeHelper = scope.require('shape');
  var striptags = require('striptags');

  function getDustTemplate(templatePath) {
    return function dustTemplate(shape, renderer, next) {
      var stream = dust.stream(templatePath, shape)
        .on('data', function(data) {
          renderer.write(data);
        })
        .on('end', next)
        .on('error', function(err) {throw err;});
      stream['decent-renderer'] = renderer;
    };
  }

  dust.helpers.shape = function shapeDustHelper(chunk, context, bodies, params) {
    var theShape = dust.helpers.tap(params.shape, chunk, context);
    if (!theShape) {
      return chunk.map(function renderEmpty(chunk) {chunk.end();});
    }
    // Clone the shape, so that its attributes can be changed between different
    // renderings of the same shape.
    // Warning: shallow copy, so weird things may still happen for object and
    // array properties.
    var shape = {meta: theShape.meta, temp: theShape.temp};
    Object.getOwnPropertyNames(theShape)
      .forEach(function(propertyName) {
        if (propertyName === 'meta' || propertyName == 'temp') return;
        shape[propertyName] = theShape[propertyName];
      });
    var name, tag;
    var attributes = {};
    Object.getOwnPropertyNames(params)
      .forEach(function(paramName) {
        var param = dust.helpers.tap(params[paramName], chunk, context);
        switch(paramName) {
          case 'shape': break;
          case 'name':
            name = param;
            break;
          case 'tag':
            tag = param;
            break;
          case 'class':
            attributes['class'] = param;
            break;
          case 'style':
            attributes.style = param;
            break;
          default:
            if (paramName.substr(0, 5) === 'data-') {
              attributes[paramName] = param;
            }
            else {
              shape[paramName] = param;
            }
        }
      });
    var renderer = chunk.root['decent-renderer'];
    return chunk.map(function renderShapeFromDust(chunk) {
      var innerRenderer = new RenderStream(renderer.scope, {
        scripts: renderer.scripts,
        stylesheets: renderer.stylesheets,
        meta: renderer.meta,
        title: renderer.title
      });
      innerRenderer
        .on('data', function onShapeData(data) {
          chunk.write(data);
        })
        .onError(function(err) {
          renderer._onError(err);
          chunk.end();
        });
      innerRenderer
        .shape({shape: shape, tag: tag, attributes: attributes, shapeName: name})
        .finally(function() {
          chunk.end();
        });
    });
  };

  dust.helpers.t = function localizationDustHelper(chunk, context, bodies) {
    var renderer = chunk.root['decent-renderer'];
    var scope = renderer.scope;
    var t = scope.require('localization') || function(s) {return s;};
    var body = dust.helpers.tap(bodies.block, chunk, context);
    var localizedBody = t(body);
    var reTokenized = localizedBody.replace(/\[([^\]]+)]/g, '{$1}');
    dust.loadSource(dust.compile(reTokenized, reTokenized));
    return chunk.map(function renderLocalizedString(chunk) {
      dust.render(reTokenized, context, function(err, rendered) {
        chunk.end(rendered);
      });
    });
  };

  dust.helpers.style = function styleDustHelper(chunk, context, bodies, params) {
    var stylesheet = dust.helpers.tap(params.name, chunk, context);
    if (!stylesheet) return;
    var renderer = chunk.root['decent-renderer'];
    if (/^(https?:)?\/\//.test(stylesheet)) {
      renderer._addExternalStyleSheet(stylesheet);
    }
    else {
      renderer._addStyleSheet(stylesheet);
    }
    return chunk;
  };

  dust.helpers.styles = function stylesDustHelper(chunk, context, bodies, params) {
    var renderer = chunk.root['decent-renderer'];
    var innerRenderer = new RenderStream(renderer.scope, {
      stylesheets: renderer.stylesheets
    });
    var html = '';
    innerRenderer.on('data', function onShapeData(data) {
      html += data;
    });
    innerRenderer._renderStyleSheets();
    return chunk.write(html);
  };

  dust.helpers.script = function scriptDustHelper(chunk, context, bodies, params) {
    var script = dust.helpers.tap(params.name, chunk, context);
    if (!script) return;
    var renderer = chunk.root['decent-renderer'];
    if (/^(https?:)?\/\//.test(script)) {
      renderer._addExternalScript(script);
    }
    else {
      renderer._addScript(script);
    }
    return chunk;
  };

  dust.helpers.scripts = function scriptsDustHelper(chunk, context, bodies, params) {
    var renderer = chunk.root['decent-renderer'];
    var innerRenderer = new RenderStream(renderer.scope, {
      scripts: renderer.scripts
    });
    var html = '';
    innerRenderer.on('data', function onShapeData(data) {
      html += data;
    });
    innerRenderer._renderScripts();
    return chunk.write(html);
  };

  dust.helpers.meta = function metaDustHelper(chunk, context, bodies, params) {
    var attributes = {};
    var name = null;
    var value = '';
    Object.getOwnPropertyNames(params).forEach(function forEachParam(attrName) {
      switch(attrName) {
        case 'name':
          name = dust.helpers.tap(params.name, chunk, context);
          break;
        case 'value':
          value = dust.helpers.tap(params.value, chunk, context);
          break;
        default:
          attributes[attrName] = dust.helpers.tap(params[attrName], chunk, context);
      }
    });
    var renderer = chunk.root['decent-renderer'];
    renderer._addMeta(name, value, attributes);
    return chunk;
  };

  dust.helpers.metas = function metasDustHelper(chunk, context, bodies, params) {
    var renderer = chunk.root['decent-renderer'];
    var innerRenderer = new RenderStream(renderer.scope, {
      meta: renderer.meta
    });
    var html = '';
    innerRenderer.on('data', function onShapeData(data) {
      html += data;
    });
    innerRenderer._renderMeta();
    return chunk.write(html);
  };

  dust.helpers.date = function dateDustHelper(chunk, context, bodies, params) {
    var renderer = chunk.root['decent-renderer'];
    var scope = renderer.scope;
    var locale = scope.require('shell').settings.locale || 'en-US';
    var val = dust.helpers.tap(params.value, chunk, context);
    if (!val) return chunk;
    var dt = (val.constructor === Date ? DateTime.fromJSDate(val) : DateTime.fromISO(val))
      .setLocale(locale);
    var format = dust.helpers.tap(params.format, chunk, context) || DateTime.DATETIME_SHORT;
    return chunk.write(dt.toFormat(format));
  }

  dust.filters.dump = function dumpDustFilter(value) {
    var filteredValue = shapeHelper.copy(value);
    return pretty(filteredValue, 2, 'HTML');
  }

  dust.filters.plain = function plainDustFilter(html) {
    return striptags(html).replace(/\s\s+/gm, ' ').replace(/[\r\n]/gm, ' ').trim();
  }

  dust.filters.firstp = function firstParagraphDustFilter(html) {
    var output = html;
    var more = html.search(/<!--more.*-->/gm);
    if (more !== -1) {
      output = html.substr(0, more);
    }
    else {
      var p = html.match(/<p[^>]*>(.*?)<\/p>/gmi) || [];
      if (p[0]) output = p[0];
    }
    return dust.filters.plain(output);
  }

  /**
   * @description
   * Loads the rendering function from the provided path.
   * @param {string} templatePath The path to the .dust file.
   * @param {Function} done The callback function to call when the template is loaded.
   * @returns {function} The template function.
   */
  this.load = function loadCodeTemplate(templatePath, done) {
    var fs = require('fs');
    if (dust.cache.hasOwnProperty(templatePath)) {
      return done(getDustTemplate(templatePath));
    }
    fs.readFile(templatePath, function readTemplate(err, template) {
      dust.register(
        templatePath,
        dust.loadSource(dust.compile(template.toString(), templatePath))
      );
      done(getDustTemplate(templatePath));
    });
  };
};
DustViewEngine.service = 'view-engine';
DustViewEngine.feature = 'dust-view-engine';
DustViewEngine.scope = 'shell';
DustViewEngine.prototype.extension = 'tl';

module.exports = DustViewEngine;