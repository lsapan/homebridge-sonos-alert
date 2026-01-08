import { Logger } from 'homebridge'
import SonosDeviceDiscovery from '@svrooij/sonos/lib/sonos-device-discovery'
import SonosDevice from '@svrooij/sonos/lib/sonos-device'

import { SonosAlertPlatform } from './platform'
import { Config, Room } from './types'

const DISCOVERY_TIMEOUT = 10
const PLAYBACK_TIMEOUT = 30
const VLAN_WARNING = 'Your Sonos system may be in a different subnet / VLAN than Homebridge. Try specifying the IP address of one of your Sonos speakers in the plugin\'s Advanced Settings.'

interface DiscoveredDevice {
    name: string;
    host: string;
    port: number;
}

export default class SonosManager {
    private readonly log: Logger = this.platform.log
    private readonly config: Config = this.platform.config
    private devices: { [name: string]: DiscoveredDevice } = {}
    private initialized = false

    constructor(private readonly platform: SonosAlertPlatform) {
        this.init()
    }

    private async init() {
        try {
            if (this.config.advanced?.ip_address) {
                this.log.info(`Connecting to Sonos system via ${this.config.advanced.ip_address}...`)
                await this.discoverFromDevice(this.config.advanced.ip_address)
            } else {
                this.log.info('Discovering rooms in your Sonos system...')
                await this.discoverAll()
            }

            if (Object.keys(this.devices).length === 0) {
                this.log.error(`Couldn't find any Sonos speakers! ${VLAN_WARNING}`)
                return
            }

            this.initialized = true
            this.logDiscoveredDevices()
            this.validateConfiguredRooms()
        } catch (err) {
            this.log.error(`Failed to connect to your Sonos system: ${err}`)
            this.log.error(VLAN_WARNING)
        }
    }

    private async discoverAll() {
        const discovery = new SonosDeviceDiscovery()
        const players = await discovery.Search(DISCOVERY_TIMEOUT)

        for (const player of players) {
            const device = new SonosDevice(player.host, player.port)
            await device.LoadDeviceData()
            this.devices[device.Name.toLowerCase()] = {
                name: device.Name,
                host: player.host,
                port: player.port,
            }
        }
    }

    private async discoverFromDevice(host: string) {
        const device = new SonosDevice(host)
        await device.LoadDeviceData()

        // Get all zones from this device
        const groups = await device.GetZoneGroupState()

        if (!groups || groups.length === 0) {
            // If we couldn't find any other speakers, just use this one
            this.log.warn('We were able to connect to the speaker you provided, but it didn\'t tell us about any other rooms in your Sonos system. Continuing with just the single speaker.')
            this.devices[device.Name.toLowerCase()] = { name: device.Name, host, port: 1400 }
            return
        }

        for (const group of groups) {
            for (const member of group.members) {
                this.devices[member.name.toLowerCase()] = {
                    name: member.name,
                    host: member.host,
                    port: member.port,
                }
            }
        }
    }

    private logDiscoveredDevices() {
        const names = Object.values(this.devices).map(d => d.name).join(', ')
        this.log.success(`Found ${Object.keys(this.devices).length} Sonos rooms(s): ${names}`)
    }

    private validateConfiguredRooms() {
        const configuredRooms = new Set<string>()

        for (const alert of this.config.alerts) {
            for (const room of alert.rooms) {
                configuredRooms.add(room.name)
            }
        }

        for (const roomName of configuredRooms) {
            // Don't treat "All" as a room name
            if (roomName.toLowerCase() === 'all') continue

            if (!this.devices[roomName.toLowerCase()]) {
                const available = Object.values(this.devices).map(d => d.name).join(', ')
                this.log.warn(`Room "${roomName}" not found in your system! Available rooms: ${available}`)
            }
        }
    }

    getAllDevices(): DiscoveredDevice[] {
        return Object.values(this.devices)
    }

    private getDevice(name: string): DiscoveredDevice | undefined {
        return this.devices[name.toLowerCase()]
    }

    async playAlert(rooms: Room[], soundUrl: string): Promise<void> {
        if (!this.initialized) {
            this.log.warn('We\'re still initializing, skipping alert...')
            return
        }

        const alertPromises: Promise<void>[] = []

        for (const room of rooms) {
            const device = this.getDevice(room.name)
            if (!device) {
                this.log.warn(`[${room.name}] Speaker not found, skipping...`)
                continue
            }

            alertPromises.push(this.playAlertOnDevice(device, soundUrl, room.volume))
        }

        await Promise.allSettled(alertPromises)
    }

    private async playAlertOnDevice(deviceInfo: DiscoveredDevice, soundUrl: string, volume?: number): Promise<void> {
        const { name } = deviceInfo

        try {
            this.log.debug(`[${name}] Playing alert...`)
            await this.tryPlayNotification(deviceInfo, soundUrl, volume)
            this.log.debug(`[${name}] Finished alert`)
        } catch (err) {
            this.log.warn(`[${name}] Alert failed, rediscovering speaker and retrying...`)

            // Try to rediscover this specific speaker
            const newDeviceInfo = await this.rediscoverDevice(name)
            if (!newDeviceInfo) {
                this.log.error(`[${name}] Could not find speaker even after rediscovery!`)
                return
            }

            // Retry with the fresh IP
            try {
                await this.tryPlayNotification(newDeviceInfo, soundUrl, volume)
                this.log.debug(`[${name}] Finished alert (after rediscovery)`)
            } catch (retryErr) {
                this.log.error(`[${name}] Failed to play alert even after rediscovery: ${retryErr}`)
            }
        }
    }

    private async tryPlayNotification(deviceInfo: DiscoveredDevice, soundUrl: string, volume?: number): Promise<void> {
        const { host, port, name } = deviceInfo
        const device = new SonosDevice(host, port)

        // Get the current state of the speaker
        const transport = await device.AVTransportService.GetTransportInfo()
        const media = await device.AVTransportService.GetMediaInfo()
        const position = await device.AVTransportService.GetPositionInfo()
        const wasPlaying = transport.CurrentTransportState === 'PLAYING'

        this.log.debug(`[${name}] Previous state: ${transport.CurrentTransportState} (${media.CurrentURI})`)

        // Save and set volume if specified
        let previousVolume: number | undefined
        if (volume !== undefined) {
            const vol = await device.RenderingControlService.GetVolume({ InstanceID: 0, Channel: 'Master' })
            previousVolume = vol.CurrentVolume
            await device.RenderingControlService.SetVolume({ InstanceID: 0, Channel: 'Master', DesiredVolume: volume })
        }

        // Play the alert
        await device.AVTransportService.SetAVTransportURI({ InstanceID: 0, CurrentURI: soundUrl, CurrentURIMetaData: '' })
        await device.Play()

        // Wait for it to finish
        await this.waitForPlaybackToStop(device)

        // Restore volume
        if (previousVolume !== undefined) {
            await device.RenderingControlService.SetVolume({ InstanceID: 0, Channel: 'Master', DesiredVolume: previousVolume })
        }

        // Resume what the speaker was previously playing
        if (wasPlaying && media.CurrentURI) {
            this.log.debug(`[${name}] Resuming playback...`)
            await device.AVTransportService.SetAVTransportURI({ InstanceID: 0, CurrentURI: media.CurrentURI, CurrentURIMetaData: media.CurrentURIMetaData ?? '' })
            try {
                await device.SeekTrack(position.Track)
                await device.SeekPosition(position.RelTime)
            } catch {
                // It's okay if the source doesn't need / support seeking
            }
            await device.Play()
        }
    }

    private async waitForPlaybackToStop(device: SonosDevice): Promise<void> {
        const start = Date.now()
        while (Date.now() - start < PLAYBACK_TIMEOUT * 1000) {
            await this.sleep(500)
            const state = await device.AVTransportService.GetTransportInfo()
            if (state.CurrentTransportState === 'STOPPED' || state.CurrentTransportState === 'PAUSED_PLAYBACK') return
        }
        this.log.warn(`[${device.Name}] Alert playback didn't finish within ${PLAYBACK_TIMEOUT} seconds, continuing anyway...`)
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    private async rediscoverDevice(name: string): Promise<DiscoveredDevice | undefined> {
        try {
            const discovery = new SonosDeviceDiscovery()
            const players = await discovery.Search(DISCOVERY_TIMEOUT)

            for (const player of players) {
                const device = new SonosDevice(player.host, player.port)
                await device.LoadDeviceData()

                if (device.Name.toLowerCase() === name.toLowerCase()) {
                    const newInfo = { name: device.Name, host: player.host, port: player.port }
                    this.devices[name.toLowerCase()] = newInfo
                    this.log.info(`[${name}] Discovered new IP: ${player.host}`)
                    return newInfo
                }
            }
        } catch (err) {
            this.log.error(`[${name}] Rediscovery failed: ${err}`)
        }

        return undefined
    }
}
