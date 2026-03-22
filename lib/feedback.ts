import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';

let markSound: Audio.Sound | null = null;
let winSound: Audio.Sound | null = null;

async function loadSounds() {
  try {
    if (!markSound) {
      const { sound } = await Audio.Sound.createAsync(
        require('../assets/sounds/mark.wav'),
      );
      markSound = sound;
    }
    if (!winSound) {
      const { sound } = await Audio.Sound.createAsync(
        require('../assets/sounds/win.wav'),
      );
      winSound = sound;
    }
  } catch {
    // Sound files not present — haptics-only mode
  }
}

loadSounds();

async function playSound(sound: Audio.Sound | null) {
  if (!sound) return;
  try {
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch {
    // ignore
  }
}

export async function feedbackMark() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  playSound(markSound);
}

export async function feedbackDone() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

export async function feedbackWin() {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  playSound(winSound);
}

export async function feedbackStart() {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

export function feedbackSelection() {
  Haptics.selectionAsync();
}
