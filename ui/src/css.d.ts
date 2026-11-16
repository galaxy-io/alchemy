import "react";

declare module "react" {
  interface CSSProperties {
    [property: `--gx-${string}`]: string | number | undefined;
  }
}
