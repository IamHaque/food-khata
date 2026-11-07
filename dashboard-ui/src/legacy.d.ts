// Legacy JSX is a separately loaded application; strict checks apply to the new app.
declare module "*.jsx";
declare module "*?raw" {
  const content: string;
  export default content;
}

