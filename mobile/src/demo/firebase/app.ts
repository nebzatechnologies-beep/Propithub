const apps: any[] = [];
export const initializeApp = (config: any, name = '[DEFAULT]') => {
  const app = { name, options: config };
  apps.push(app);
  return app;
};
export const getApps = () => apps;
export const getApp = () => apps[0];
export const deleteApp = async (_a: any) => {};
