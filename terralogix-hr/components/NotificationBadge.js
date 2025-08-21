import React, { useEffect, useState } from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { getNotifications } from '../api';
export default function NotificationBadge({ onPress }) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    getNotifications().then(n => setCount(n.filter(i => !i.read).length));
  }, []);
  return (
    <TouchableOpacity onPress={onPress} style={{ marginRight: 12 }}>
      <Text style={{ backgroundColor: '#ff3b30', color: '#fff', borderRadius: 10, paddingHorizontal: 8 }}>
        {count}
      </Text>
    </TouchableOpacity>
  );
}
