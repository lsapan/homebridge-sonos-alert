# homebridge-sonos-alert

A Homebridge plugin to play a sound in one or more Sonos rooms when a HomeKit switch is triggered. Perfect for doorbells, alarms, sensors, and more! Incredibly fast and simple to set up. ⚡️

## Features

- Set up as many alerts as you'd like, each with their own sound URL
- Choose which room(s) you want an alert to play in, or play it on every speaker
- Optionally, choose the volume you want to play an alert at in each room (for example, louder in the Living Room and quieter in the Bedroom)
- Speakers automatically go back to what they were playing when the alert finishes
- Works with complex VLAN setups! No need to worry if you have an advanced network.

## How does this plugin work?

Each alert creates a separate switch in HomeKit. When the switch is turned on, the plugin sends the alert sound to your chosen speakers, and then turns the switch back off so the alert is ready to be used again.

With that in mind, all you need to do to play an alert in an automation is to turn on the alert's switch.

You can also manually turn a switch on if you'd like to test that it works!

## Installation

Install via the Homebridge UI by searching for `homebridge-sonos-alert`, or manually:

```bash
npm install -g homebridge-sonos-alert
```

We highly recommend installing via Homebridge [Config UI X](https://github.com/oznu/homebridge-config-ui-x) as it will make configuration incredibly easy.

## Configuration

The easiest way to configure the plugin is through the Homebridge UI.

Here's an example config that shows a mix of different options and settings. Bear in mind that many settings are optional.

```json
"platforms": [{
    "platform": "Sonos Alert",
    "name": "Sonos Alerts",
    "alerts": [
        {
            "name": "Play Doorbell",
            "soundUrl": "https://example.com/doorbell.mp3",
            "rooms": [
                {
                    "name": "Living Room",
                    "volume": 50,
                },
                {
                    "name": "Bedroom",
                    "volume": 20,
                },
                {
                    "name": "Kitchen"
                },
            ]
        },
        {
            "name": "Play Freeze Alert",
            "soundUrl": "https://example.com/freeze.mp3",
            "rooms": [
                {
                    "name": "All",
                },
            ]
        }
    ],
    "advanced": {
        "ip_address": "10.1.2.42"
    }
}]
```

### Configuration Options

| Option | Required | Description |
|--------|----------|-------------|
| `alerts`                  | Yes | List of alerts you want to be able to play on your Sonos speakers |
| `alerts[].name` | Yes | The display name to show on the alert's switch in the Home app |
| `alerts[].soundUrl` | Yes | URL to the sound file (note: your Sonos speakers must be able to access the file) |
| `alerts[].rooms` | Yes | List of room(s) to play the alert in |
| `alerts[].rooms[].name` | Yes | The room's name as shown in the Sonos app, or `"All"` to play the alert on every Sonos speaker |
| `alerts[].rooms[].volume` | No | Volume level (0-100) for this room. If not set, plays the alert at the room's current volume |
| `advanced.ip_address` | No | IP address of a single Sonos speaker in your network. You should only set this if auto-discovery is failing (due to a complex VLAN, etc.) |

### A quick note on Sound URLs

Keep in mind that your Sonos speakers need to be able to access the sound URL directly. The sound can be an audio file from the internet, or one hosted locally on your network (from a web server, NAS, etc.).

If you go for a locally hosted file, ensure that your Sonos speakers aren't blocked from loading it by a firewall.

## Troubleshooting

### Speakers not discovered

When the plugin starts up, it logs every speaker that it was able to discover. If it isn't able to discover your speakers, you may be running Homebridge in a different VLAN than your speakers are in.

Don't worry though! You can enter the IP address of any Sonos speaker on your network, and the plugin will connect to it directly rather than relying on multicast / discovery. Once it connects to that speaker, the speaker will pass along the info of every other speaker in your Sonos system.

In other words, you can still play alerts in any rooms that you want even if you enter a single speaker's IP. If you go this route, we highly recommend assigning a static IP to that speaker.

### Room name not found

Room names must be entered exactly as they appear in the Sonos app (case-insensitive). If you're not sure what your room names are, check the plugin's logs - it lists all of the room names it discovers when it starts up.

When in doubt, you can also set the room to `All` to play the alert everywhere.

### Sound not playing

Odds are, your speakers aren't able to actually access the URL you provided. Double check that it's accessible, and you don't have a firewall blocking the speakers from loading the file.

Be sure to try a different file to rule out anything with that file / format.

You can also double check the plugin's logs to make sure it received the alert event, and sent it to the speakers.
