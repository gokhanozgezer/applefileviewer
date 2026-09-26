import { describe, it, expect } from 'vitest';
import { resolveAttachmentFileId, attachmentKind } from '@main/modules/messages/attachmentResolver';
import { computeFileId } from '@main/modules/manifest/fileId';

describe('attachmentResolver', () => {
  it('resolveAttachmentFileId — ~/Library/SMS prefix → MediaDomain', () => {
    const fid = resolveAttachmentFileId('~/Library/SMS/Attachments/aa/bb/UUID/IMG_0001.HEIC');
    expect(fid).toBe(
      computeFileId('MediaDomain', 'Library/SMS/Attachments/aa/bb/UUID/IMG_0001.HEIC'),
    );
  });

  it('resolveAttachmentFileId — null/boş → null', () => {
    expect(resolveAttachmentFileId(null)).toBeNull();
    expect(resolveAttachmentFileId('')).toBeNull();
    expect(resolveAttachmentFileId('   ')).toBeNull();
  });

  it('resolveAttachmentFileId — Library/SMS bulunamazsa ham relative dene', () => {
    const fid = resolveAttachmentFileId('/var/mobile/Media/foo/bar.jpg');
    expect(fid).toBe(computeFileId('MediaDomain', 'var/mobile/Media/foo/bar.jpg'));
  });

  it('attachmentKind — mime tipinden', () => {
    expect(attachmentKind('image/heic')).toBe('image');
    expect(attachmentKind('video/quicktime')).toBe('video');
    expect(attachmentKind('audio/amr')).toBe('audio');
    expect(attachmentKind('application/pdf')).toBe('file');
    expect(attachmentKind(null)).toBe('file');
  });
});
