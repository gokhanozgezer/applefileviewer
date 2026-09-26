// src/main/pathOverrides.ts
// Test/izolasyon için yol override'ları — index.ts'te İLK import olmalı:
// store.ts (electron-store) userData'yı import anında okur. ESM import'ları
// sırayla değerlendirildiğinden bu modülün yan etkisi ondan önce çalışır.
//
// Windows'ta APPDATA ortam değişkeni Electron'un appData yolunu DEĞİŞTİRMEZ
// (SHGetKnownFolderPath) — e2e gerçek kullanıcının yedeklerini ve ayarlarını
// görüyordu. İki açık override:
//   AFV_USER_DATA_DIR  → userData (ayarlar, cache, log) izole kök
//   AFV_BACKUP_DIR     → varsayılan yedek klasörü (defaultPath.ts okur)
import { app } from 'electron';
import path from 'node:path';

const userData = process.env.AFV_USER_DATA_DIR;
if (userData && path.isAbsolute(userData)) {
  app.setPath('userData', userData);
}
