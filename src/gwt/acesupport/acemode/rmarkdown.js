/*
 * markdown.js
 *
 * Copyright (C) 2009-12 by RStudio, Inc.
 *
 * The Initial Developer of the Original Code is
 * Ajax.org B.V.
 * Portions created by the Initial Developer are Copyright (C) 2010
 * the Initial Developer. All Rights Reserved.
 *
 * Unless you have received this program directly from RStudio pursuant
 * to the terms of a commercial license agreement with RStudio, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */

define("mode/rmarkdown", function(require, exports, module) {

var oop = require("ace/lib/oop");
var MarkdownMode = require("mode/markdown").Mode;
var Tokenizer = require("ace/tokenizer").Tokenizer;
var RMarkdownHighlightRules = require("mode/rmarkdown_highlight_rules").RMarkdownHighlightRules;
var MatchingBraceOutdent = require("ace/mode/matching_brace_outdent").MatchingBraceOutdent;
var RMatchingBraceOutdent = require("mode/r_matching_brace_outdent").RMatchingBraceOutdent;
var SweaveBackgroundHighlighter = require("mode/sweave_background_highlighter").SweaveBackgroundHighlighter;
var RCodeModel = require("mode/r_code_model").RCodeModel;
var MarkdownFoldMode = require("ace/mode/folding/markdown").FoldMode;
var Utils = require("mode/utils");
var unicode = require("ace/unicode");

var Mode = function(suppressHighlighting, session) {
   var that = this;

   this.$session = session;
   this.$tokenizer = new Tokenizer(new RMarkdownHighlightRules().getRules());

   this.$outdent = new MatchingBraceOutdent();
   this.$r_outdent = {};
   oop.implement(this.$r_outdent, RMatchingBraceOutdent);

   this.codeModel = new RCodeModel(session, this.$tokenizer, /^r-/,
                                   /^(?:[ ]{4})?`{3,}\s*\{r(.*)\}\s*$/);

   var markdownFoldingRules = new MarkdownFoldMode();

   this.foldingRules = {

      getFoldWidget: function(session, foldStyle, row) {
         if (that.getLanguageMode({row: row, column: 0}) == "Markdown")
            return markdownFoldingRules.getFoldWidget(session, foldStyle, row);
         else
            return that.codeModel.getFoldWidget(session, foldStyle, row);
      },

      getFoldWidgetRange: function(session, foldStyle, row) {
         if (that.getLanguageMode({row: row, column: 0}) == "Markdown")
            return markdownFoldingRules.getFoldWidgetRange(session, foldStyle, row);
         else
            return that.codeModel.getFoldWidgetRange(session, foldStyle, row);
      }

   };

   this.$sweaveBackgroundHighlighter = new SweaveBackgroundHighlighter(
         session,
         /^(?:[ ]{4})?`{3,}\s*\{r(?:.*)\}\s*$/,
         /^(?:[ ]{4})?`{3,}\s*$/,
         true);
};
oop.inherits(Mode, MarkdownMode);

(function() {

   this.insertChunkInfo = {
      value: "```{r}\n\n```\n",
      position: {row: 0, column: 5}
   };

   this.getLanguageMode = function(position)
   {
      var state = Utils.getPrimaryState(this.$session, position.row);

      if (state.match(/^r-cpp-(?!r-)/))
         return 'C_CPP';
      else
         return state.match(/^r-/) ? 'R' : 'Markdown';
   };

   this.inCppLanguageMode = function(state)
   {
      return state.match(/^r-cpp-(?!r-)/);
   };

   this.inMarkdownLanguageMode = function(state)
   {
      return !state.match(/^r-/);
   };

   this.getNextLineIndent = function(state, line, tab)
   {
      state = Utils.primaryState(state);
      if (!this.inCppLanguageMode(state))
         return this.codeModel.getNextLineIndent(state, line, tab);
      else {
         // from c_cpp getNextLineIndent
         var indent = this.$getIndent(line);

         var tokenizedLine = this.$tokenizer.getLineTokens(line, state);
         var tokens = tokenizedLine.tokens;
         var endState = tokenizedLine.state;

         if (tokens.length && tokens[tokens.length-1].type == "comment") {
            return indent;
         }

         if (state == "r-cpp-start") {
            var match = line.match(/^.*[\{\(\[]\s*$/);
            if (match) {
                indent += tab;
            }
         } else if (state == "r-cpp-doc-start") {
            if (endState == "start") {
                return "";
            }
            var match = line.match(/^\s*(\/?)\*/);
            if (match) {
                if (match[1]) {
                    indent += " ";
                }
                indent += "* ";
            }
        }

        return indent;
      }
   };

    this.checkOutdent = function(state, line, input) {
        state = Utils.primaryState(state);
        if (this.inCppLanguageMode(state))
            return this.$outdent.checkOutdent(line, input);
        else
            return this.$r_outdent.checkOutdent(state, line, input);
    };

    this.autoOutdent = function(state, doc, row) {
        state = Utils.primaryState(state);
        if (this.inCppLanguageMode(state))
            return this.$outdent.autoOutdent(doc, row);
        else
            return this.$r_outdent.autoOutdent(state, doc, row, this.codeModel);
    };

    this.transformAction = function(state, action, editor, session, text) {
        state = Utils.primaryState(state);
        // from c_cpp.js
        if (action === 'insertion') {
            if ((text === "\n") && this.inCppLanguageMode(state)) {
                // If newline in a doxygen comment, continue the comment
                var pos = editor.getSelectionRange().start;
                var match = /^((\s*\/\/+')\s*)/.exec(session.doc.getLine(pos.row));
                if (match && editor.getSelectionRange().start.column >= match[2].length) {
                    return {text: "\n" + match[1]};
                }
            }

            else if ((text === "R") && this.inCppLanguageMode(state)) {
                // If newline to start and embedded R chunk complete the chunk
                var pos = editor.getSelectionRange().start;
                var match = /^(\s*\/\*{3,}\s*)/.exec(session.doc.getLine(pos.row));
                if (match && editor.getSelectionRange().start.column >= match[1].length) {
                    return {text: "R\n\n*/\n",
                            selection: [1,0,1,0]};
                }
            }
        }
        return false;
    };

    this.tokenRe = new RegExp("^["
        + unicode.packages.L
        + unicode.packages.Mn + unicode.packages.Mc
        + unicode.packages.Nd
        + unicode.packages.Pc + "._]+", "g"
    );

    this.nonTokenRe = new RegExp("^(?:[^"
        + unicode.packages.L
        + unicode.packages.Mn + unicode.packages.Mc
        + unicode.packages.Nd
        + unicode.packages.Pc + "._]|\s])+", "g"
    );
   

}).call(Mode.prototype);

exports.Mode = Mode;
});
