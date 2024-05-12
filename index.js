const sonos = require('sonos')

module.exports = (api) => {
    api.registerAccessory('SonosAlert', SonosAlertAccessory)
}

class SonosAlertAccessory {
    constructor(log, config, api) {
        this.log = log
        this.api = api
        this.config = config
        this.alerts = config.alerts || []
        this.services = []

        this.Service = this.api.hap.Service
        this.Characteristic = this.api.hap.Characteristic

        this.alerts.forEach((alert) => {
            const switchService = new this.Service.Switch(alert.name)
            switchService
                .getCharacteristic(this.Characteristic.On)
                .on('set', (value, callback) => this.setSwitchState(value, callback, alert, switchService))

            this.services.push(switchService)
        })
    }

    setSwitchState(value, callback, alert, switchService) {
        if (value) {
            this.alertRooms(alert.rooms, alert.soundUrl)
            setTimeout(() => {
                switchService.setCharacteristic(this.Characteristic.On, false)
            }, 100)
        }

        callback(null)
    }

    getServices() {
        return this.services
    }

    getGroups() {
        this.log('Getting Sonos groups...')
        return new Promise((resolve) => {
            sonos.DeviceDiscovery().once('DeviceAvailable', async (device) => {
                this.log(`Found a device at: ${device.host}`)
                const groups = await device.getAllGroups()
                resolve(groups)
                this.log(`Got groups: ${groups.map(group => group.Name).join(', ')}`)
            })
        })
    }

    async getGroupsForRooms(rooms) {
        const groups = await this.getGroups()
        return groups.filter(group => {
            const groupRooms = group.ZoneGroupMember.map(member => member.ZoneName)
            return rooms.some(room => groupRooms.includes(room))
        })
    }

    async alertGroup(group, sound) {
        this.log(`[${group.Name}] Loading state...`)
        const device = group.CoordinatorDevice()
        const state = await device.getCurrentState()
        const track = await device.currentTrack()
        this.log(`[${group.Name}] Previous state: ${state} (${track.uri})`)
        this.log(`[${group.Name}] Playing alert...`)
        await device.play(sound)
        device.once('PlaybackStopped', async () => {
            this.log(`[${group.Name}] Alert finished!`)
            if (track.uri && state === 'playing') {
                this.log(`[${group.Name}] Resuming track...`)
                await device.setAVTransportURI(track.uri)
            }
        })
    }

    async alertRooms(rooms, sound) {
        const targetGroups = await this.getGroupsForRooms(rooms)
        targetGroups.forEach((group) => {
            try {
                this.alertGroup(group, sound)
            } catch (e) {
                this.log(`[${group.Name}] Failed to alert! ${e}`)
            }
        })
    }
}
