import React from 'react';
import { Composition } from 'remotion';
import { Kampagne, DURATION, FPS } from './Kampagne';
import { ToSider, DURATION as TS_DURATION } from './ToSider';
export const Root: React.FC = () => (
  <>
  <Composition id="DuoKampagne" component={Kampagne} durationInFrames={DURATION} fps={FPS} width={1080} height={1920} defaultProps={{ bgm: true }} />
  <Composition id="DuoToSider" component={ToSider} durationInFrames={TS_DURATION} fps={FPS} width={1080} height={1920} defaultProps={{ bgm: true }} />
  </>
);
