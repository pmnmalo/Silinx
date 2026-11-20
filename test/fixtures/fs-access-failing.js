// A step of the in-memory FileSystemDirectoryHandle (fs-access-fake.js) made to fail, for the tests of what a failure on
// the way leaves (#4724): failing(root, method, when, { once }) makes `method` of every folder handle of root's tree
// (removeEntry, getFileHandle, getDirectoryHandle) throw a NoModificationAllowedError when `when(dir, name, options,
// real)` says so (it may do part of the work first through `real`, the methods as they were); returns the undo.
export function failing(root, method, when, { once = false } = {}) {
  const proto = Object.getPrototypeOf(root);
  const real = { getDirectoryHandle: proto.getDirectoryHandle, getFileHandle: proto.getFileHandle, removeEntry: proto.removeEntry };
  let done = false;
  proto[method] = async function (name, options) {
    if (!(once && done) && await when(this, name, options, real)) {
      done = true;
      throw Object.assign(new Error('NoModificationAllowedError'), { name: 'NoModificationAllowedError' });
    }
    return real[method].call(this, name, options);
  };
  return () => { proto[method] = real[method]; };
}
