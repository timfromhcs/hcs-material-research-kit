/**
 * React 19 removed the global `JSX` namespace from `@types/react`; the types now
 * live on `React.JSX`. The codebase (and every downstream consumer of these
 * packages) still writes `JSX.Element`, so this shim maps the global name onto
 * the React-owned namespace instead of rewriting every signature.
 */
import type { JSX as ReactJSX } from "react";

declare global {
  namespace JSX {
    type Element = ReactJSX.Element;
    type ElementClass = ReactJSX.ElementClass;
    type ElementAttributesProperty = ReactJSX.ElementAttributesProperty;
    type ElementChildrenAttribute = ReactJSX.ElementChildrenAttribute;
    type IntrinsicAttributes = ReactJSX.IntrinsicAttributes;
    type IntrinsicClassAttributes<T> = ReactJSX.IntrinsicClassAttributes<T>;
    type IntrinsicElements = ReactJSX.IntrinsicElements;
  }
}
