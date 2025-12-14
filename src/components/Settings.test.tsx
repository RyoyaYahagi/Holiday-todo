import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Settings } from './Settings';
import type { AppSettings } from '../types';

// Mock types
const mockSettings: AppSettings = {
    discordWebhookUrl: 'https://discord.com/api/webhooks/test',
    notifyOnDayBefore: false,
    notifyDayBeforeTime: '21:00',
    notifyBeforeTask: false,
    notifyBeforeTaskMinutes: 30,
    scheduleInterval: 2,
    startTimeMorning: 8,
    startTimeAfternoon: 13,
    maxTasksPerDay: 5,
    maxPriority: 5
};

describe('Settings Component', () => {
    const mockOnUpdateSettings = vi.fn();
    const mockOnSaveEvents = vi.fn();
    const mockOnExport = vi.fn();
    const mockOnImport = vi.fn();

    const defaultProps = {
        settings: mockSettings,
        onUpdateSettings: mockOnUpdateSettings,
        onSaveEvents: mockOnSaveEvents,
        onExport: mockOnExport,
        onImport: mockOnImport,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders correctly with initial settings', () => {
        render(<Settings {...defaultProps} />);

        expect(screen.getByDisplayValue(mockSettings.discordWebhookUrl)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /設定を保存する/i })).toBeInTheDocument();
    });

    it('does not call onUpdateSettings when values change but save is not clicked', () => {
        render(<Settings {...defaultProps} />);

        const webhookInput = screen.getByDisplayValue(mockSettings.discordWebhookUrl);
        fireEvent.change(webhookInput, { target: { value: 'https://new-url.com' } });

        expect(mockOnUpdateSettings).not.toHaveBeenCalled();
    });

    it('calls onUpdateSettings with new values when save is clicked', () => {
        render(<Settings {...defaultProps} />);

        const webhookInput = screen.getByDisplayValue(mockSettings.discordWebhookUrl);
        const newUrl = 'https://new-url.com';
        fireEvent.change(webhookInput, { target: { value: newUrl } });

        const saveButton = screen.getByRole('button', { name: /設定を保存する/i });
        fireEvent.click(saveButton);

        expect(mockOnUpdateSettings).toHaveBeenCalledWith({
            ...mockSettings,
            discordWebhookUrl: newUrl
        });

        // Success message should appear
        expect(screen.getByText(/設定を保存しました/i)).toBeInTheDocument();
    });

    it('resets changes when reset button is clicked and confirmed', () => {
        // Mock window.confirm
        const confirmSpy = vi.spyOn(window, 'confirm');
        confirmSpy.mockImplementation(() => true);

        render(<Settings {...defaultProps} />);

        const webhookInput = screen.getByDisplayValue(mockSettings.discordWebhookUrl);
        fireEvent.change(webhookInput, { target: { value: 'https://changed-url.com' } });

        const resetButton = screen.getByRole('button', { name: /元に戻す/i });
        fireEvent.click(resetButton);

        expect(confirmSpy).toHaveBeenCalled();
        // Should revert to original value
        expect(screen.getByDisplayValue(mockSettings.discordWebhookUrl)).toBeInTheDocument();
        // Save should not be called
        expect(mockOnUpdateSettings).not.toHaveBeenCalled();

        confirmSpy.mockRestore();
    });
});
