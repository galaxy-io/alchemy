// `process.env.NODE_ENV` instead of `import.meta.env`: Vite inlines it in the app build and leaves it
// for the consumer in the library build, so the module is debuggable inside a host too.
export const IS_DEBUG = process.env.NODE_ENV !== "production";

export const GITHUB_REPO_URL: string = "https://github.com/galaxy-io/alchemy";
export const DOCUMENTATION_URL: string = "https://docs.getgalaxy.io/alchemy";
export const PUBLIC_API_URL: string = "https://alchemy.getgalaxy.io";
