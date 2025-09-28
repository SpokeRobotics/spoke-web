---
title: Multi-Model Viewer Scenes
description: Focused examples showcasing multi-model state transitions using the ModelViewer component.
---

## Exploded Assembly Demo

<ModelViewer toolsEnabled={true} height={420} expandedHeight={620}>

| name           | start                          | body                           | electronics                    | exploded                     | body_exploded                 | electronics_exploded         | path                                              |
|-------         |----------------------          |----------------------          |----------------------          |----------------------        |----------------------         |----------------------        |---------------------------------------------------|
| Frame          | 0, 0, 0, 0, 0, 0, 1            | 0, 0, 0, 0, 0, 0, 1            | 0, 0, 0, 0, 0, 0, 0            | 0, 0, 0, 0, 0, 0, 1          | 0, 0, 0, 0, 0, 0, 1           | 0, 0, 0, 0, 0, 0, 0          | Cuboid_96x_64_32_4mm_Frame.3mf                    |
| FrontPanel     | 0, 0, 48, 90, 0, 90, 1         | 0, 0, 48, 90, 0, 90, 1         | 0, 0, 48, 90, 0, 90, 0         | 0, 0, 80, 90, 0, 90, 1       | 0, 0, 80, 90, 0, 90, 1        | 0, 0, 80, 90, 0, 90, 0       | RectPanel_64_32_4mm_1.3mf                         |
| RearPanel      | 0, 0, -48, -90, 0, 90, 1       | 0, 0, -48, -90, 0, 90, 1       | 0, 0, -48, -90, 0, 90, 0       | 0, 0, -80, -90, 0, 90, 1     | 0, 0, -80, -90, 0, 90, 1      | 0, 0, -80, -90, 0, 90, 0     | RectPanel_64_32_4mm_1.3mf                         |
| TopPanel       | 0, 16, 0, 0, 0, 0, 1           | 0, 16, 0, 0, 0, 0, 1           | 0, 16, 0, 0, 0, 0, 0           | 0, 48, 0, 0, 0, 0, 1         | 0, 48, 0, 0, 0, 0, 1          | 0, 48, 0, 0, 0, 0, 0         | RectPanel_96x_64_PcbMount_28_4mm.3mf              |
| BottomPanel    | 0, -16, 0, 180, 0, 0, 1        | 0, -16, 0, 180, 0, 0, 1        | 0, -16, 0, 180, 0, 0, 0        | 0, -48, 0, 180, 0, 0, 1      | 0, -48, 0, 180, 0, 0, 1       | 0, -48, 0, 180, 0, 0, 0      | RectPanel_96x_64_PcbMount_28_MagCon_4mm_.3mf      |
| BottomPanelDoor| 0, -16, 0, 180, 0, 0, 1        | 0, -16, 0, 180, 0, 0, 1        | 0, -16, 0, 180, 0, 0, 0        | 0, -80, 0, 180, 0, 0, 1      | 0, -80, 0, 180, 0, 0, 1       | 0, -80, 0, 180, 0, 0, 0      | RectPanel_96x_64_PcbMount_28_MagCon_4mm_WPCDoor.3mf |
| LeftPanel      | 32, 0, 0, 0, 0, -90, 1         | 32, 0, 0, 0, 0, -90, 1         | 32, 0, 0, 0, 0, -90, 0         | 96, 0, 0, 0, 0, -90, 1       | 96, 0, 0, 0, 0, -90, 1        | 96, 0, 0, 0, 0, -90, 0       | RectPanel_96x_32_Cell_18650_4mm_1.3mf             |
| RightPanel     | -32, 0, 0, 0, 0, 90, 1         | -32, 0, 0, 0, 0, 90, 1         | -32, 0, 0, 0, 0, 90, 0         | -96, 0, 0, 0, 0, 90, 1       | -96, 0, 0, 0, 0, 90, 1        | -96, 0, 0, 0, 0, 90, 0       | RectPanel_96x_32_Cell_18650_4mm_1.3mf             |
| LeftBattery    |  20, 0, -33, 90, 0, 0, 1       |  20, 0, -33, 90, 0, 0, 0       |  20, 0, -33, 90, 0, 0, 1       |  64, 0, -33, 90, 0, 0, 1     |  64, 0, -33, 90, 0, 0, 0      |  64, 0, -33, 90, 0, 0, 1     | 18650Li-IonCell_1.3mf                             |
| RightBattery   | -20, 0, 33, -90, 0, 0, 1       | -20, 0, 33, -90, 0, 0, 0       | -20, 0, 33, -90, 0, 0, 1       | -64, 0, 33, -90, 0, 0, 1     | -64, 0, 33, -90, 0, 0, 0      | -64, 0, 33, -90, 0, 0, 1     | 18650Li-IonCell_1.3mf                             |
| Charger        | -12, -13, -18, 0, -90, -90, 1  | -12, -13, -18, 0, -90, -90, 0  | -12, -13, -18, 0, -90, -90, 1  | -12, -32, -18, 0, -90, -90, 1| -12, -32, -18, 0, -90, -90, 0 | -12, -32, -18, 0, -90, -90, 1| SpokeCharger_lo.3mf   |
| WPCBoard       | -13, -13, -22, -90, 0, 0, 1    | -13, -13, -22, -90, 0, 0, 0    | -13, -13, -22, -90, 0, 0, 1    | -13, -32, -24, -90, 0, 0, 1  | -13, -32, -24, -90, 0, 0, 0   | -13, -32, -24, -90, 0, 0, 1  | SpokeWirelessPowerReceiver_lo.3mf   |
| WPCCoil        | 0, -16, 0, 90, 0, 0, 1         | 0, -16, 0, 90, 0, 0, 0         | 0, -16, 0, 90, 0, 0, 1         | 0, -64, 0, 90, 0, 0, 1       | 0, -64, 0, 90, 0, 0, 0        | 0, -64, 0, 90, 0, 0, 1       | Qi_Coil.3mf   |
| Controller     | -13, 14, 35, 0, 90, -90, 1     | -13, 14, 35, 0, 90, -90, 0     | -13, 14, 35, 0, 90, -90, 1     | -13, 32, 35, 0, 90, -90, 1   | -13, 32, 35, 0, 90, -90, 0    | -13, 32, 35, 0, 90, -90, 1   | SpokeControllerEsp32S3_lo.3mf   |
| MagConnector   | -21, -17, -33, 180, 0, 0, 1    | -21, -17, -33, 180, 0, 0, 0    | -21, -17, -33, 180, 0, 0, 1    | -21, -32, -33, 180, 0, 0, 1  | -21, -32, -33, 180, 0, 0, 0   | -21, -32, -33, 180, 0, 0, 1  | MagneticConnector8mm.3mf   |

| from     | to       |
|--------  |----------|
| start    | exploded, body, electronics |
| exploded | start  |
| body     | start, electronics, body_exploded |
| body_exploded | start  |
| electronics | start, body, electronics_exploded |
| electronics_exploded | electronics, start |


</ModelViewer>

Simple body only

<ModelViewer toolsEnabled={true} height={420} expandedHeight={620}>

| name           | start                    | exploded                 | flat                 | path                                              |
|-------         |----------------------    |----------------------    |----------------------|---------------------------------------------------|
| Frame          | 0, 0, 0, 0, 0, 0, 1      | 0, 0, 0, 0, 0, 0, 1      |    0, 0, 0, 0, 0, 0, 1      | Cuboid_96x_64_32_4mm_Frame.3mf                    |
| FrontPanel     | 0, 0, 48, 90, 0, 90, 1   | 0, 0, 80, 90, 0, 90, 1   |    0, 0,  96, 0,  90, 0, 1  | RectPanel_64_32_4mm_1.3mf                         |
| RearPanel      | 0, 0, -48, -90, 0, 90, 1 | 0, 0, -80, -90, 0, 90, 1 |    0, 0, -96, 0,  90, 0, 1  | RectPanel_64_32_4mm_1.3mf                         |
| TopPanel       | 0, 16, 0, 0, 0, 0, 1     | 0, 48, 0, 0, 0, 0, 1     | -144, 0, 0, 0, 0, 0, 1  | RectPanel_96x_64_PcbMount_28_4mm.3mf              |
| BottomPanel    | 0, -16, 0, 180, 0, 0, 1  | 0, -48, 0, 180, 0, 0, 1  |  144, 0, 0, 0, 0, 0, 1  | RectPanel_96x_64_PcbMount_28_MagCon_4mm_.3mf      |
| BottomPanelDoor| 0, -16, 0, 180, 0, 0, 1  | 0, -64, 0, 180, 0, 0, 1  |  216, 0, 0, 0, 0, 0, 1  | RectPanel_96x_64_PcbMount_28_MagCon_4mm_WPCDoor.3mf |
| LeftPanel      | 32, 0, 0, 0, 0, -90, 1   | 64, 0, 0, 0, 0, -90, 1   |   64, 0, 0, 0, 0, 0, 1  | RectPanel_96x_32_Cell_18650_4mm_1.3mf             |
| RightPanel     | -32, 0, 0, 0, 0, 90, 1   | -64, 0, 0, 0, 0, 90, 1   |  -64, 0, 0, 0, 0, 0, 1  | RectPanel_96x_32_Cell_18650_4mm_1.3mf             |

| from     | to       |
|--------  |----------|
| start    | exploded, flat  |
| exploded | start, flat     |
| flat     | start, exploded |

</ModelViewer>
