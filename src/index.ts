import { API } from 'homebridge'

import { PLATFORM_NAME } from './settings'
import { SonosAlertPlatform } from './platform'

// Register our platform with Homebridge
export default (api: API): void => {
    api.registerPlatform(PLATFORM_NAME, SonosAlertPlatform)
}
