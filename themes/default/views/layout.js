// DecentCMS (c) 2014 Bertrand Le Roy, under MIT. See LICENSE.txt for licensing details.
'use strict';

module.exports = function layoutTemplate(layout, renderer, scope) {
  renderer
    .addMeta('generator', 'DecentCMS')
    .addStyleSheet('bootstrap')
    .addScript('bootstrap')

    .doctype()
    .writeLine()
    .startTag('html')
    .writeLine()
    .startTag('head')
    .writeLine()

    .write('  ')
    .tag('title', {}, renderer.title)
    .writeLine()

    .renderMeta()
    .renderStyleSheets()

    .endTag()
    .writeLine()
    .startTag('body');

  if (layout.main) {
    scope.emit('decent.core.shape.render', {
      shape: layout.main,
      renderStream: renderer
    });
  }

  renderer
    .writeLine()

    .renderScripts()

    .endAllTags();
};