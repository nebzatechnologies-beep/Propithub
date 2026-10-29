// Polyfills for React Native (Hermes / Expo) runtime environment
// Resolves: "Uncaught Error: Unknown encoding: latin1" from fast-png / jspdf

const globalScope: any =
  typeof globalThis !== 'undefined'
    ? globalThis
    : typeof global !== 'undefined'
      ? global
      : typeof window !== 'undefined'
        ? window
        : {};

// 1. TextDecoder Polyfill for latin1 / iso-8859-1 / windows-1252
if (typeof globalScope.TextDecoder !== 'undefined') {
  const OriginalTextDecoder = globalScope.TextDecoder;

  class PatchedTextDecoder extends OriginalTextDecoder {
    private _isCustomEncoding: boolean;
    private _customLabel: string;

    constructor(label: string = 'utf-8', options?: any) {
      const norm = String(label).trim().toLowerCase().replace(/[_-]/g, '');
      const isLegacySingleByte =
        norm === 'latin1' ||
        norm === 'iso88591' ||
        norm === 'windows1252' ||
        norm === 'ascii' ||
        norm === 'usascii';

      if (isLegacySingleByte) {
        super('utf-8', options);
        this._isCustomEncoding = true;
        this._customLabel = label;
      } else {
        super(label, options);
        this._isCustomEncoding = false;
        this._customLabel = label;
      }
    }

    get encoding(): string {
      return this._isCustomEncoding ? this._customLabel : super.encoding;
    }

    decode(input?: any, options?: any): string {
      if (this._isCustomEncoding && input) {
        let bytes: Uint8Array;
        if (input instanceof Uint8Array) {
          bytes = input;
        } else if (input && input.buffer instanceof ArrayBuffer) {
          bytes = new Uint8Array(input.buffer, input.byteOffset || 0, input.byteLength ?? input.length);
        } else if (Array.isArray(input)) {
          bytes = new Uint8Array(input);
        } else {
          try {
            bytes = new Uint8Array(input);
          } catch {
            return '';
          }
        }

        let result = '';
        const chunkSize = 4096;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const slice = bytes.subarray(i, i + chunkSize);
          result += String.fromCharCode.apply(null, Array.from(slice));
        }
        return result;
      }
      return super.decode(input, options);
    }
  }

  globalScope.TextDecoder = PatchedTextDecoder;
}

// 2. btoa & atob polyfill if not natively provided by the JS engine
if (typeof globalScope.btoa === 'undefined') {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  globalScope.btoa = (input: string = ''): string => {
    const str = String(input);
    let output = '';
    for (
      let block = 0, charCode, i = 0, map = chars;
      str.charAt(i | 0) || ((map = '='), i % 1);
      output += map.charAt(63 & (block >> (8 - (i % 1) * 8)))
    ) {
      charCode = str.charCodeAt((i += 3 / 4));
      if (charCode > 0xff) {
        throw new Error("'btoa' failed: The string to be encoded contains characters outside of the Latin1 range.");
      }
      block = (block << 8) | charCode;
    }
    return output;
  };
}

if (typeof globalScope.atob === 'undefined') {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
  globalScope.atob = (input: string = ''): string => {
    let str = String(input).replace(/[=]+$/, '');
    if (str.length % 4 === 1) {
      throw new Error("'atob' failed: The string to be decoded is not correctly encoded.");
    }
    let output = '';
    for (
      let bc = 0, bs = 0, buffer, i = 0;
      (buffer = str.charAt(i++));
      ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
        ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
        : 0
    ) {
      buffer = chars.indexOf(buffer);
    }
    return output;
  };
}

// 3. Backward-compatibility bridge for createPermissionHook on 'expo'
try {
  const expoModulesCore = require('expo-modules-core');
  const expo = require('expo');
  if (expo && !expo.createPermissionHook && typeof expoModulesCore?.createPermissionHook === 'function') {
    expo.createPermissionHook = expoModulesCore.createPermissionHook;
  }
} catch (_e) {}

export {};
