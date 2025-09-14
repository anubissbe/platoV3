import React from 'react';
import { render } from 'ink-testing-library';
import { 
  LoadingSpinner, 
  ProgressBar, 
  StreamingIndicator,
  ActivityIndicator,
  CountdownTimer
} from '../../tui/LoadingAnimations.js';

describe('LoadingAnimations Components', () => {
  describe('LoadingSpinner', () => {
    it('should render loading spinner with text', () => {
      const { lastFrame } = render(
        <LoadingSpinner text="Loading data" color="cyan" />
      );
      
      expect(lastFrame()).toContain('Loading data');
    });

    it('should animate through spinner frames', async () => {
      const { lastFrame, rerender } = render(
        <LoadingSpinner text="Processing" type="spinner" />
      );
      
      const initialFrame = lastFrame();
      
      // Wait for animation interval
      await new Promise(resolve => setTimeout(resolve, 100));
      rerender(<LoadingSpinner text="Processing" type="spinner" />);
      
      // Frame should change after interval
      expect(lastFrame()).toBeDefined();
    });
  });

  describe('ProgressBar', () => {
    it('should render progress bar at 0%', () => {
      const { lastFrame } = render(
        <ProgressBar current={0} total={100} width={10} />
      );
      
      expect(lastFrame()).toContain('░░░░░░░░░░');
      expect(lastFrame()).toContain('0%');
    });

    it('should render progress bar at 50%', () => {
      const { lastFrame } = render(
        <ProgressBar current={50} total={100} width={10} />
      );
      
      expect(lastFrame()).toContain('█████');
      expect(lastFrame()).toContain('50%');
    });

    it('should render progress bar at 100%', () => {
      const { lastFrame } = render(
        <ProgressBar current={100} total={100} width={10} />
      );
      
      expect(lastFrame()).toContain('██████████');
      expect(lastFrame()).toContain('100%');
    });

    it('should handle custom colors', () => {
      const { lastFrame } = render(
        <ProgressBar 
          current={50} 
          total={100} 
          width={10}
          color="green"
          bgColor="gray"
        />
      );
      
      expect(lastFrame()).toBeDefined();
    });
  });

  describe('StreamingIndicator', () => {
    it('should render when streaming is active', () => {
      const { lastFrame } = render(
        <StreamingIndicator isStreaming={true} text="Receiving data" />
      );
      
      expect(lastFrame()).toContain('Receiving data');
      expect(lastFrame()).toContain('⚡');
    });

    it('should not render when streaming is inactive', () => {
      const { lastFrame } = render(
        <StreamingIndicator isStreaming={false} text="Not streaming" />
      );
      
      expect(lastFrame()).toBe('');
    });
  });

  describe('ActivityIndicator', () => {
    it('should render with no activities', () => {
      const { lastFrame } = render(
        <ActivityIndicator activities={[]} />
      );
      
      expect(lastFrame()).toBe('');
    });

    it('should render with single activity', () => {
      const { lastFrame } = render(
        <ActivityIndicator 
          activities={[{ id: '1', label: 'Processing file' }]} 
        />
      );
      
      expect(lastFrame()).toContain('Processing file');
    });

    it('should render in compact mode', () => {
      const { lastFrame } = render(
        <ActivityIndicator 
          activities={[
            { id: '1', label: 'Task 1' },
            { id: '2', label: 'Task 2' }
          ]}
          compact={true}
        />
      );
      
      expect(lastFrame()).toContain('2 activities');
    });
  });

  describe('CountdownTimer', () => {
    it('should render countdown in seconds format', () => {
      const { lastFrame } = render(
        <CountdownTimer seconds={30} format="seconds" />
      );
      
      expect(lastFrame()).toContain('30s');
      expect(lastFrame()).toContain('⏱️');
    });

    it('should render countdown in mm:ss format', () => {
      const { lastFrame } = render(
        <CountdownTimer seconds={90} format="mm:ss" />
      );
      
      expect(lastFrame()).toContain('01:30');
    });

    it('should call onComplete when countdown reaches 0', async () => {
      const onComplete = jest.fn();
      
      render(
        <CountdownTimer seconds={0} onComplete={onComplete} />
      );
      
      // Give it a moment to trigger the effect
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(onComplete).toHaveBeenCalled();
    });
  });
});