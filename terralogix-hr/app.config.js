import 'dotenv/config';

export default ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    package: "com.terralogix.hr", // Firebase Android package name
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON || "./android/app/google-services.json"
  },
});
