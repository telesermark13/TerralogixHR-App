import React from "react";
import { AuthProvider } from "./AuthContext";
import RootNavigator from "./navigation/RootNavigator";
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://da3f311cc5a9b246d279874385eb811a@o45100723760167808.ingest.us.sentry.io/4510072376066048',
  sendDefaultPii: true,
  enableLogs: true,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],
  // spotlight: __DEV__, // Uncomment to enable Spotlight
});

function App() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

export default Sentry.wrap(App);