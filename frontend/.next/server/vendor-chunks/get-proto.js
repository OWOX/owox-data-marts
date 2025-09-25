"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/get-proto";
exports.ids = ["vendor-chunks/get-proto"];
exports.modules = {

/***/ "(ssr)/../../node_modules/get-proto/Object.getPrototypeOf.js":
/*!*************************************************************!*\
  !*** ../../node_modules/get-proto/Object.getPrototypeOf.js ***!
  \*************************************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

eval("\nvar $Object = __webpack_require__(/*! es-object-atoms */ \"(ssr)/../../node_modules/es-object-atoms/index.js\");\n/** @type {import('./Object.getPrototypeOf')} */ module.exports = $Object.getPrototypeOf || null;\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi4vLi4vbm9kZV9tb2R1bGVzL2dldC1wcm90by9PYmplY3QuZ2V0UHJvdG90eXBlT2YuanMiLCJtYXBwaW5ncyI6IkFBQUE7QUFFQSxJQUFJQSxVQUFVQyxtQkFBT0EsQ0FBQztBQUV0Qiw4Q0FBOEMsR0FDOUNDLE9BQU9DLE9BQU8sR0FBR0gsUUFBUUksY0FBYyxJQUFJIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vQG93b3gvbmV4dGpzLWZyb250ZW5kLy4uLy4uL25vZGVfbW9kdWxlcy9nZXQtcHJvdG8vT2JqZWN0LmdldFByb3RvdHlwZU9mLmpzP2U3NjMiXSwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnO1xuXG52YXIgJE9iamVjdCA9IHJlcXVpcmUoJ2VzLW9iamVjdC1hdG9tcycpO1xuXG4vKiogQHR5cGUge2ltcG9ydCgnLi9PYmplY3QuZ2V0UHJvdG90eXBlT2YnKX0gKi9cbm1vZHVsZS5leHBvcnRzID0gJE9iamVjdC5nZXRQcm90b3R5cGVPZiB8fCBudWxsO1xuIl0sIm5hbWVzIjpbIiRPYmplY3QiLCJyZXF1aXJlIiwibW9kdWxlIiwiZXhwb3J0cyIsImdldFByb3RvdHlwZU9mIl0sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(ssr)/../../node_modules/get-proto/Object.getPrototypeOf.js\n");

/***/ }),

/***/ "(ssr)/../../node_modules/get-proto/Reflect.getPrototypeOf.js":
/*!**************************************************************!*\
  !*** ../../node_modules/get-proto/Reflect.getPrototypeOf.js ***!
  \**************************************************************/
/***/ ((module) => {

eval("\n/** @type {import('./Reflect.getPrototypeOf')} */ module.exports = typeof Reflect !== \"undefined\" && Reflect.getPrototypeOf || null;\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi4vLi4vbm9kZV9tb2R1bGVzL2dldC1wcm90by9SZWZsZWN0LmdldFByb3RvdHlwZU9mLmpzIiwibWFwcGluZ3MiOiJBQUFBO0FBRUEsK0NBQStDLEdBQy9DQSxPQUFPQyxPQUFPLEdBQUcsT0FBUUMsWUFBWSxlQUFlQSxRQUFRQyxjQUFjLElBQUsiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9Ab3dveC9uZXh0anMtZnJvbnRlbmQvLi4vLi4vbm9kZV9tb2R1bGVzL2dldC1wcm90by9SZWZsZWN0LmdldFByb3RvdHlwZU9mLmpzPzRmNmQiXSwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnO1xuXG4vKiogQHR5cGUge2ltcG9ydCgnLi9SZWZsZWN0LmdldFByb3RvdHlwZU9mJyl9ICovXG5tb2R1bGUuZXhwb3J0cyA9ICh0eXBlb2YgUmVmbGVjdCAhPT0gJ3VuZGVmaW5lZCcgJiYgUmVmbGVjdC5nZXRQcm90b3R5cGVPZikgfHwgbnVsbDtcbiJdLCJuYW1lcyI6WyJtb2R1bGUiLCJleHBvcnRzIiwiUmVmbGVjdCIsImdldFByb3RvdHlwZU9mIl0sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(ssr)/../../node_modules/get-proto/Reflect.getPrototypeOf.js\n");

/***/ }),

/***/ "(ssr)/../../node_modules/get-proto/index.js":
/*!*********************************************!*\
  !*** ../../node_modules/get-proto/index.js ***!
  \*********************************************/
/***/ ((module, __unused_webpack_exports, __webpack_require__) => {

eval("\nvar reflectGetProto = __webpack_require__(/*! ./Reflect.getPrototypeOf */ \"(ssr)/../../node_modules/get-proto/Reflect.getPrototypeOf.js\");\nvar originalGetProto = __webpack_require__(/*! ./Object.getPrototypeOf */ \"(ssr)/../../node_modules/get-proto/Object.getPrototypeOf.js\");\nvar getDunderProto = __webpack_require__(/*! dunder-proto/get */ \"(ssr)/../../node_modules/dunder-proto/get.js\");\n/** @type {import('.')} */ module.exports = reflectGetProto ? function getProto(O) {\n    // @ts-expect-error TS can't narrow inside a closure, for some reason\n    return reflectGetProto(O);\n} : originalGetProto ? function getProto(O) {\n    if (!O || typeof O !== \"object\" && typeof O !== \"function\") {\n        throw new TypeError(\"getProto: not an object\");\n    }\n    // @ts-expect-error TS can't narrow inside a closure, for some reason\n    return originalGetProto(O);\n} : getDunderProto ? function getProto(O) {\n    // @ts-expect-error TS can't narrow inside a closure, for some reason\n    return getDunderProto(O);\n} : null;\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi4vLi4vbm9kZV9tb2R1bGVzL2dldC1wcm90by9pbmRleC5qcyIsIm1hcHBpbmdzIjoiQUFBQTtBQUVBLElBQUlBLGtCQUFrQkMsbUJBQU9BLENBQUM7QUFDOUIsSUFBSUMsbUJBQW1CRCxtQkFBT0EsQ0FBQztBQUUvQixJQUFJRSxpQkFBaUJGLG1CQUFPQSxDQUFDO0FBRTdCLHdCQUF3QixHQUN4QkcsT0FBT0MsT0FBTyxHQUFHTCxrQkFDZCxTQUFTTSxTQUFTQyxDQUFDO0lBQ3BCLHFFQUFxRTtJQUNyRSxPQUFPUCxnQkFBZ0JPO0FBQ3hCLElBQ0VMLG1CQUNDLFNBQVNJLFNBQVNDLENBQUM7SUFDcEIsSUFBSSxDQUFDQSxLQUFNLE9BQU9BLE1BQU0sWUFBWSxPQUFPQSxNQUFNLFlBQWE7UUFDN0QsTUFBTSxJQUFJQyxVQUFVO0lBQ3JCO0lBQ0EscUVBQXFFO0lBQ3JFLE9BQU9OLGlCQUFpQks7QUFDekIsSUFDRUosaUJBQ0MsU0FBU0csU0FBU0MsQ0FBQztJQUNwQixxRUFBcUU7SUFDckUsT0FBT0osZUFBZUk7QUFDdkIsSUFDRSIsInNvdXJjZXMiOlsid2VicGFjazovL0Bvd294L25leHRqcy1mcm9udGVuZC8uLi8uLi9ub2RlX21vZHVsZXMvZ2V0LXByb3RvL2luZGV4LmpzP2MxNDkiXSwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnO1xuXG52YXIgcmVmbGVjdEdldFByb3RvID0gcmVxdWlyZSgnLi9SZWZsZWN0LmdldFByb3RvdHlwZU9mJyk7XG52YXIgb3JpZ2luYWxHZXRQcm90byA9IHJlcXVpcmUoJy4vT2JqZWN0LmdldFByb3RvdHlwZU9mJyk7XG5cbnZhciBnZXREdW5kZXJQcm90byA9IHJlcXVpcmUoJ2R1bmRlci1wcm90by9nZXQnKTtcblxuLyoqIEB0eXBlIHtpbXBvcnQoJy4nKX0gKi9cbm1vZHVsZS5leHBvcnRzID0gcmVmbGVjdEdldFByb3RvXG5cdD8gZnVuY3Rpb24gZ2V0UHJvdG8oTykge1xuXHRcdC8vIEB0cy1leHBlY3QtZXJyb3IgVFMgY2FuJ3QgbmFycm93IGluc2lkZSBhIGNsb3N1cmUsIGZvciBzb21lIHJlYXNvblxuXHRcdHJldHVybiByZWZsZWN0R2V0UHJvdG8oTyk7XG5cdH1cblx0OiBvcmlnaW5hbEdldFByb3RvXG5cdFx0PyBmdW5jdGlvbiBnZXRQcm90byhPKSB7XG5cdFx0XHRpZiAoIU8gfHwgKHR5cGVvZiBPICE9PSAnb2JqZWN0JyAmJiB0eXBlb2YgTyAhPT0gJ2Z1bmN0aW9uJykpIHtcblx0XHRcdFx0dGhyb3cgbmV3IFR5cGVFcnJvcignZ2V0UHJvdG86IG5vdCBhbiBvYmplY3QnKTtcblx0XHRcdH1cblx0XHRcdC8vIEB0cy1leHBlY3QtZXJyb3IgVFMgY2FuJ3QgbmFycm93IGluc2lkZSBhIGNsb3N1cmUsIGZvciBzb21lIHJlYXNvblxuXHRcdFx0cmV0dXJuIG9yaWdpbmFsR2V0UHJvdG8oTyk7XG5cdFx0fVxuXHRcdDogZ2V0RHVuZGVyUHJvdG9cblx0XHRcdD8gZnVuY3Rpb24gZ2V0UHJvdG8oTykge1xuXHRcdFx0XHQvLyBAdHMtZXhwZWN0LWVycm9yIFRTIGNhbid0IG5hcnJvdyBpbnNpZGUgYSBjbG9zdXJlLCBmb3Igc29tZSByZWFzb25cblx0XHRcdFx0cmV0dXJuIGdldER1bmRlclByb3RvKE8pO1xuXHRcdFx0fVxuXHRcdFx0OiBudWxsO1xuIl0sIm5hbWVzIjpbInJlZmxlY3RHZXRQcm90byIsInJlcXVpcmUiLCJvcmlnaW5hbEdldFByb3RvIiwiZ2V0RHVuZGVyUHJvdG8iLCJtb2R1bGUiLCJleHBvcnRzIiwiZ2V0UHJvdG8iLCJPIiwiVHlwZUVycm9yIl0sInNvdXJjZVJvb3QiOiIifQ==\n//# sourceURL=webpack-internal:///(ssr)/../../node_modules/get-proto/index.js\n");

/***/ })

};
;