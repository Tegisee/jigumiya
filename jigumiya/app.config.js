export default {
  expo: {
    name: "지금이야",
    slug: "jigumiya",
    version: "1.0.4",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "dark",
    scheme: "jigumiya",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#000000",
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.jigumiya.app",
      buildNumber: "37",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        LSApplicationQueriesSchemes: ["coupang", "itms-appss"],
      },
      entitlements: {
        "com.apple.security.application-groups": [
          "group.com.jigumiya.app",
        ],
      },
    },
    android: {
      package: "com.jigumiya.app",
      versionCode: 37,
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
      adaptiveIcon: {
        backgroundColor: "#000000",
        foregroundImage: "./assets/icon_android_512.png",
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      "expo-router",
      [
        "expo-notifications",
        {
          sounds: [],
        },
      ],
      [
        "expo-share-intent",
        {
          iosShareExtensionName: "JigumiyaShareExtension",
          iosActivationRules: {
            NSExtensionActivationSupportsText: true,
            NSExtensionActivationSupportsWebURLWithMaxCount: 1,
          },
        },
      ],
    ],
    extra: {
      router: {},
      eas: {
        projectId: "ab8af1db-338d-480f-bbbd-9a58cbbf2812",
      },
    },
    owner: "june56189906",
  },
};
