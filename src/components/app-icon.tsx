import { SymbolView, type AndroidSymbol, type SFSymbol, type SymbolViewProps } from 'expo-symbols';

const androidNames: Partial<Record<SFSymbol, AndroidSymbol>> = {
  'arrow.uturn.backward.circle.fill': 'undo',
  'barcode.viewfinder': 'barcode_scanner',
  'camera.fill': 'photo_camera',
  'camera.metering.center.weighted': 'center_focus_strong',
  'checkmark.circle.fill': 'check_circle',
  'checkmark.shield.fill': 'verified_user',
  'doc.fill': 'description',
  'doc.badge.plus': 'note_add',
  'doc.on.doc.fill': 'content_copy',
  'doc.text.fill': 'description',
  'exclamationmark.shield.fill': 'shield',
  'exclamationmark.triangle.fill': 'warning',
  'globe': 'language',
  'house.fill': 'home',
  'icloud.and.arrow.up.fill': 'cloud_upload',
  'info.circle.fill': 'info',
  'link.badge.plus': 'link',
  'lock.shield.fill': 'shield_lock',
  'music.note': 'music_note',
  'pencil': 'edit',
  'person.2.fill': 'group',
  'person.badge.plus': 'person_add',
  'person.crop.circle.fill': 'account_circle',
  'photo.fill': 'photo',
  'plus': 'add',
  'shippingbox': 'inventory_2',
  'shippingbox.and.arrow.backward.fill': 'inventory_2',
  'shippingbox.fill': 'inventory_2',
  'square.and.arrow.up': 'share',
  'star.fill': 'star',
  'trash.fill': 'delete',
  'truck.box.fill': 'local_shipping',
  'video.fill': 'videocam',
  'viewfinder': 'center_focus_strong',
  'xmark': 'close',
  'xmark.circle.fill': 'cancel',
};

export type AppIconName = SFSymbol;
export type AppIconProps = Omit<SymbolViewProps, 'name'> & { name: AppIconName };

export function AppIcon({ name, ...props }: AppIconProps) {
  const android = androidNames[name] ?? 'help';
  return <SymbolView {...props} name={{ ios: name, android, web: android }} />;
}
