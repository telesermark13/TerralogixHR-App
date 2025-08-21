import React from 'react';
import { Modal, View, Text, Button, StyleSheet } from 'react-native';
export default function AppModal({ visible, title, children, onClose }) {
  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.bg}>
        <View style={styles.modal}>
          <Text style={styles.title}>{title}</Text>
          {children}
          <Button title="Close" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  bg: { flex:1, backgroundColor:'rgba(0,0,0,0.25)', justifyContent:'center', alignItems:'center' },
  modal: { width:'80%', backgroundColor:'#fff', borderRadius:12, padding:24 },
  title: { fontWeight:'bold', fontSize:18, marginBottom:8 }
});
