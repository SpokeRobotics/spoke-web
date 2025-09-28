'use client'

import { Button } from '@radix-ui/themes'

export function Toolbar({
  spinMode,
  frameMode,
  shadingMode,
  originVisible,
  axesVisible = false,
  showCadControls = true,
  onCycleSpin,
  onToggleFrame,
  onToggleShading,
  onToggleOrigin,
  onToggleAxes,
  targetHelperVisible = false,
  onToggleTargetHelper,
  boundingBoxesVisible = false,
  onToggleBoundingBoxes,
  modelCenterVisible = false,
  onToggleModelCenter,
  styleMode,
  onCycleStyle,
  backgroundMode,
  onCycleBackground,
  outlineThreshold,
  onCycleOutlineThreshold,
  outlineScale,
  onCycleOutlineScale,
  edgesMode,
  onCycleEdges,
  outlineColorMode,
  onCycleOutlineColor,
  edgesLineWidth,
  onCycleEdgesLineWidth,
  ambientLevel,
  directionalLevel,
  onCycleAmbientLevel,
  onCycleDirectionalLevel,
  leading,
  children,
}) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {leading}
      <Button onClick={onCycleAmbientLevel}>
        AMB: {ambientLevel === 0 ? 'OFF' : ambientLevel.toFixed(1)}
      </Button>
      <Button onClick={onCycleDirectionalLevel}>
        DIR: {directionalLevel === 0 ? 'OFF' : directionalLevel.toFixed(1)}
      </Button>
      <Button onClick={onCycleStyle}>
        STYLE: {styleMode || 'BASIC'}
      </Button>
      <Button onClick={onCycleBackground}>
        BACK: {backgroundMode || 'WHITE'}
      </Button>
      {showCadControls && (
        <Button onClick={onCycleEdges}>
          EDGES: {edgesMode || 'AUTO'}
        </Button>
      )}
      {showCadControls && edgesMode !== 'OFF' && (
        <Button onClick={onCycleOutlineThreshold}>
          EDGE THR: {outlineThreshold}{'\u00B0'}
        </Button>
      )}
      {showCadControls && edgesMode !== 'OFF' && (
        <Button onClick={onCycleEdgesLineWidth}>
          EDGE W: {(Number(edgesLineWidth ?? 2)).toFixed(2)}
        </Button>
      )}
      {(styleMode === 'OUTLINE' || styleMode === 'TOON') && (
        <>
          <Button onClick={onCycleOutlineColor}>
            OUTLINE COL: {outlineColorMode || 'AUTO'}
          </Button>
          <Button onClick={onCycleOutlineScale}>
            OUTLINE: {outlineScale?.toFixed ? outlineScale.toFixed(3) : outlineScale}x
          </Button>
        </>
      )}
      <Button onClick={onCycleSpin}>
        SPIN: {(spinMode === 'on') ? 'ON' : (spinMode === 'auto') ? 'AUTO' : 'OFF'}
      </Button>
      {showCadControls && (
        <Button onClick={onToggleFrame}>
          FRAME: {frameMode}
        </Button>
      )}
      {showCadControls && (
        <Button onClick={onToggleShading}>
          SHADING: {shadingMode}
        </Button>
      )}
      {children}
      {showCadControls && (
        <>
          <Button onClick={onToggleOrigin}>
            ORIGIN: {originVisible ? 'ON' : 'OFF'}
          </Button>
          <Button onClick={onToggleAxes}>
            AXES: {axesVisible ? 'ON' : 'OFF'}
          </Button>
        </>
      )}
      {typeof onToggleTargetHelper === 'function' && (
        <Button onClick={onToggleTargetHelper}>
          TARGET: {targetHelperVisible ? 'ON' : 'OFF'}
        </Button>
      )}
      {typeof onToggleBoundingBoxes === 'function' && (
        <Button onClick={onToggleBoundingBoxes}>
          BBOX: {boundingBoxesVisible ? 'ON' : 'OFF'}
        </Button>
      )}
      {typeof onToggleModelCenter === 'function' && (
        <Button onClick={onToggleModelCenter}>
          MODEL CTR: {modelCenterVisible ? 'ON' : 'OFF'}
        </Button>
      )}
    </div>
  )
}
