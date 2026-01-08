import { PlatformConfig } from 'homebridge'

export interface Room {
    name: string;
    volume?: number;
}

export interface Alert {
    name: string;
    soundUrl: string;
    rooms: Room[];
}

export interface AdvancedConfig {
    ip_address?: string;
}

export interface Config extends PlatformConfig {
    name: string;
    alerts: Alert[];
    advanced?: AdvancedConfig;
}
