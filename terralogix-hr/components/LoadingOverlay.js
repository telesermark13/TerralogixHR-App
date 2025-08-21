import React from 'react';
import { View, ActivityIndicator, StyleSheet, Modal } from 'react-native';
export default function LoadingOverlay({ visible }) {
  if (!visible) return null;
  return (
    <Modal transparent animationType="fade" visible>
      <View style={styles.bg}>
        <ActivityIndicator size="large" color="#00BFFF" />
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.2)', justifyContent: 'center', alignItems: 'center' }
});
