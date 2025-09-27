// screens/LoginScreen.js
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Keyboard,
  Image,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuth } from '../AuthContext';


import { Ionicons } from '@expo/vector-icons';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [username, setUsername] = useState(''); // email/username
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async () => {
    const u = username.trim();
    const p = password; // keep exact pw
    if (!u || !p) {
      Alert.alert('Login failed', 'Please enter both username and password.');
      return;
    }

    setLoading(true);
    try {
      const { success, error } = await signIn(u, p);
      if (!success) {
        throw new Error(error || 'Login failed');
      }
      // Navigation will be handled by RootNavigator
    } catch (e) {
      Alert.alert('Login failed', e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#fff' }}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
    >
      <View style={styles.container}>
        <Image
          source={require('../assets/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.welcome}>Welcome to Terralogix HR</Text>

        <TextInput
          placeholder="Email or Username"
          value={username}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
          onChangeText={setUsername}
          editable={!loading}
          returnKeyType="next"
          onSubmitEditing={() => {
            // Move focus could be added via ref; for now noop
          }}
        />

        <View style={styles.passwordRow}>
          <TextInput
            placeholder="Password"
            value={password}
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            secureTextEntry={!showPassword}
            onChangeText={setPassword}
            editable={!loading}
            returnKeyType="go"
            onSubmitEditing={handleLogin}
          />
          <TouchableOpacity
            onPress={() => setShowPassword((x) => !x)}
            style={styles.eyeButton}
            disabled={loading}
          >
            <Ionicons name={showPassword ? 'eye' : 'eye-off'} size={22} color="#999" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[
            styles.button,
            (!username || !password || loading) && styles.buttonDisabled,
          ]}
          onPress={handleLogin}
          disabled={!username || !password || loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Login</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.forgotButton}
          onPress={() => {
            // navigation.navigate('ForgotPassword'); // wire up when ready
          }}
        >
          <Text style={styles.forgotText}>Forgot password?</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  logo: {
    width: 170,
    height: 80,
    marginBottom: 16,
    alignSelf: 'center',
  },
  welcome: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#00BFFF',
    marginBottom: 20,
    alignSelf: 'center',
  },
  input: {
    width: '100%',
    backgroundColor: '#F5F6F8',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 14,
    borderColor: '#E0E0E0',
    borderWidth: 1,
    fontSize: 16,
  },
  passwordRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  eyeButton: {
    position: 'absolute',
    right: 16,
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  button: {
    width: '100%',
    backgroundColor: '#00BFFF',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    marginTop: 10,
  },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  buttonDisabled: { opacity: 0.5 },
  forgotButton: { marginTop: 18, alignSelf: 'center' },
  forgotText: { color: '#00BFFF', fontSize: 16, fontWeight: '500' },
});
