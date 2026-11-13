const { existsSync } = require("node:fs");
const { resolve } = require("node:path");

module.exports = ({ config }) => {
  const variant = process.env.BB_MOBILE_VARIANT ?? "production";
  if (variant !== "production" && variant !== "dev") {
    throw new Error("BB_MOBILE_VARIANT must be production or dev");
  }
  const isDev = variant === "dev";
  const devOverride = (name) => {
    const value = isDev ? process.env[name]?.trim() : undefined;
    return value ? value : undefined;
  };
  const devIosBundleIdentifier = devOverride(
    "BB_MOBILE_DEV_IOS_BUNDLE_IDENTIFIER",
  );
  const devEasProjectId = devOverride("BB_MOBILE_DEV_EAS_PROJECT_ID");
  const devExpoOwner = devOverride("BB_MOBILE_DEV_EXPO_OWNER");
  const devExpoSlug = devOverride("BB_MOBILE_DEV_EXPO_SLUG");
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON
    ? resolve(process.env.GOOGLE_SERVICES_JSON)
    : resolve(__dirname, "google-services.json");
  if (
    !isDev &&
    process.env.GOOGLE_SERVICES_JSON &&
    !existsSync(googleServicesFile)
  ) {
    throw new Error(
      "GOOGLE_SERVICES_JSON must point to an existing Firebase configuration file",
    );
  }
  return {
    ...config,
    ...(devExpoOwner ? { owner: devExpoOwner } : {}),
    ...(devExpoSlug ? { slug: devExpoSlug } : {}),
    extra: {
      ...config.extra,
      bbMobileVariant: variant,
      ...(devEasProjectId
        ? { eas: { ...config.extra.eas, projectId: devEasProjectId } }
        : {}),
    },
    ...(isDev
      ? {
          name: "bb dev",
          icon: "./assets/icon-dev.png",
          web: { ...config.web, favicon: "./assets/favicon-dev.png" },
          plugins: config.plugins.map((plugin) =>
            Array.isArray(plugin) && plugin[0] === "expo-splash-screen"
              ? [
                  plugin[0],
                  {
                    ...plugin[1],
                    image: "./assets/splash-logo-dev.png",
                    dark: {
                      ...plugin[1].dark,
                      image: "./assets/splash-logo-dev.png",
                    },
                  },
                ]
              : plugin,
          ),
        }
      : {}),
    ios: {
      ...config.ios,
      ...(isDev
        ? {
            icon: {
              light: "./assets/ios-icon-dev.png",
              dark: "./assets/ios-icon-dev-dark.png",
            },
          }
        : {}),
      ...(devIosBundleIdentifier
        ? { bundleIdentifier: devIosBundleIdentifier, associatedDomains: [] }
        : {}),
    },
    android: {
      ...config.android,
      ...(isDev
        ? {
            package: "app.getbb.mobile.dev",
            googleServicesFile: undefined,
            intentFilters: [],
            adaptiveIcon: {
              ...config.android.adaptiveIcon,
              foregroundImage: "./assets/android-icon-foreground-dev.png",
            },
          }
        : existsSync(googleServicesFile)
          ? { googleServicesFile }
          : {}),
    },
  };
};
