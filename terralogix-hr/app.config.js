import 'dotenv/config';

export default ({ config }) => ({
  ...config,
  plugins: [
    ...(config.plugins || []),
    "expo-font",
    [
      "expo-build-properties",
      {
        android: {
          compileSdkVersion: 35,
          targetSdkVersion: 35,
          buildToolsVersion: "35.0.0"
        }
      }
    ]
  ],
  android: {
    ...config.android,
    package: "com.terralogix.hr",
    googleServicesFile: "./google-services.json"
  },
  extra: {
    ...(config.extra || {}),
    eas: {
      ...(config.extra?.eas || {}),
      projectId: "3dfa5117-d674-4045-8ab6-7f3d484ca0df"
    }
  }
});
