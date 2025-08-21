import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { postTimeIn, postTimeOut, createLeave, clearPendingAttendance, clearPendingLeave } from '../api';

export async function queueAction(type, data) {
  const key = type === 'attendance' ? 'pendingAttendance' : 'pendingLeave';
  let queue = JSON.parse(await AsyncStorage.getItem(key) || '[]');
  queue.push(data);
  await AsyncStorage.setItem(key, JSON.stringify(queue));
}

export async function processQueue() {
  const net = await NetInfo.fetch();
  if (!net.isConnected) return;

  // Attendance
  let attRaw = await AsyncStorage.getItem('pendingAttendance');
  let attQueue = attRaw ? JSON.parse(attRaw) : [];
  let attSuccess = [];
  for (let i = 0; i < attQueue.length; i++) {
    try {
      if (attQueue[i].type === 'in') await postTimeIn(attQueue[i].payload);
      if (attQueue[i].type === 'out') await postTimeOut(attQueue[i].payload);
      attSuccess.push(i);
    } catch {}
  }
  if (attSuccess.length) await clearPendingAttendance();

  // Leaves
  let leaveRaw = await AsyncStorage.getItem('pendingLeave');
  let leaveQueue = leaveRaw ? JSON.parse(leaveRaw) : [];
  let leaveSuccess = [];
  for (let i = 0; i < leaveQueue.length; i++) {
    try {
      await createLeave(leaveQueue[i]);
      leaveSuccess.push(i);
    } catch {}
  }
  if (leaveSuccess.length) await clearPendingLeave();
}

// Call processQueue() on app start and every time NetInfo connection changes
NetInfo.addEventListener(state => { if (state.isConnected) processQueue(); });

export default { queueAction, processQueue };
