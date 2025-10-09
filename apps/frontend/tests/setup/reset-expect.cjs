const jestMatchersSymbol = Symbol.for("$$jest-matchers-object");
const originalDefineProperty = Object.defineProperty;

Object.defineProperty = function patchedDefineProperty(target, propertyKey, attributes) {
  if (propertyKey === jestMatchersSymbol) {
    try {
      return originalDefineProperty(target, propertyKey, attributes);
    } catch (error) {
      const existing = Object.getOwnPropertyDescriptor(target, propertyKey);
      if (existing && existing.configurable === false) {
        return target;
      }
      throw error;
    }
  }

  return originalDefineProperty(target, propertyKey, attributes);
};
