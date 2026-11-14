// The single place that decides whether Orbis Pro is active.
//
// TODO(account): later this is where an account / licence is checked (signed token, entitlement from the account
// service, grace period offline). Until then Pro is just the local switch in the settings and nothing is verified.
// Nothing else in the app may read `settings.pro` directly: ask `proEnabled`.
import { computed } from '@preact/signals';
import { settings } from '../state/settings';

export const proEnabled = computed<boolean>(() => settings.value.pro === true);
