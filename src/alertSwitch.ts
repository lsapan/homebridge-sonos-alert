import { Characteristic, Service, PlatformAccessory, CharacteristicValue, Logger } from 'homebridge'

import { SonosAlertPlatform } from './platform'
import { PLATFORM_NAME, PLUGIN_VERSION } from './settings'
import SonosManager from './sonos'
import { Alert } from './types'

export class AlertSwitch {
    private readonly Service: typeof Service = this.platform.Service
    private readonly Characteristic: typeof Characteristic = this.platform.Characteristic
    private readonly log: Logger = this.platform.log
    private service: Service

    constructor(
        private readonly platform: SonosAlertPlatform,
        private readonly accessory: PlatformAccessory,
        private readonly alert: Alert,
        private readonly sonos: SonosManager,
    ) {
        this.setMetadata()
        this.service = this.registerSwitch()
    }

    setMetadata() {
        this.accessory.getService(this.Service.AccessoryInformation)!
            .setCharacteristic(this.Characteristic.Manufacturer, PLATFORM_NAME)
            .setCharacteristic(this.Characteristic.Model, this.alert.name)
            .setCharacteristic(this.Characteristic.SerialNumber, this.alert.name)
            .setCharacteristic(this.Characteristic.FirmwareRevision, PLUGIN_VERSION)
    }

    registerSwitch(): Service {
        const service = this.accessory.getService(this.Service.Switch) || this.accessory.addService(this.Service.Switch)
        service.setCharacteristic(this.platform.Characteristic.Name, this.alert.name)
        service.getCharacteristic(this.platform.Characteristic.On).onSet(this.setOn.bind(this))
        return service
    }

    async setOn(value: CharacteristicValue) {
        if (!value) return

        this.log.info(`[${this.alert.name}] Alert activated!`)

        // Play in all rooms if the room is set to "All"
        const rooms = this.alert.rooms.flatMap(room => {
            if (room.name.toLowerCase() === 'all') {
                return this.sonos.getAllDevices().map(d => ({ name: d.name, volume: room.volume }))
            }
            return [room]
        })

        // Play the alert in the background
        this.sonos.playAlert(rooms, this.alert.soundUrl)
            .catch(err => this.log.error(`[${this.alert.name}] Failed to play alert: ${err}`))

        // Turn the switch back off so it can be activated again
        setTimeout(() => {
            this.service.updateCharacteristic(this.Characteristic.On, false)
        }, 100)
    }
}
