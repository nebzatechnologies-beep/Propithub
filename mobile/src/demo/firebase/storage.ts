export const getStorage = (_a?: any) => ({});
export const ref = (_s: any, path: string) => ({ path });
export const uploadString = async (r: any, data: string) => ({ ref: r, data });
export const uploadBytes = async (r: any, data: any) => ({ ref: r, data });
export const getDownloadURL = async (r: any) =>
  `https://demo.propithub.app/files/${encodeURIComponent(r?.path || 'file')}`;
