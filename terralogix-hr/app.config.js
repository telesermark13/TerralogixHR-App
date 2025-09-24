import 'dotenv/config';

export default ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    package: "com.terralogix.hr",
    googleServicesFile: "./google-services.json"
  },
});
