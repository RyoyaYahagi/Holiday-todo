import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Settings } from './Settings';
import type { AppSettings } from '../types';

// Mock types
const mockSettings: AppSettings = {
    lineChannelAccessToken: 'test-channel-access-token',
    lineUserId: 'U1234567890123456789012345678901',
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

        expect(screen.getByDisplayValue(mockSettings.lineUserId)).toBeInTheDocument();
        // 保存ボタンが複数存在するため、少なくとも1つ存在することを確認
        expect(screen.getAllByRole('button', { name: /保存/i }).length).toBeGreaterThan(0);
    });

    it('does not call onUpdateSettings when values change but save is not clicked', () => {
        render(<Settings {...defaultProps} />);

        const userIdInput = screen.getByDisplayValue(mockSettings.lineUserId);
        fireEvent.change(userIdInput, { target: { value: 'U9999999999999999999999999999999' } });

        expect(mockOnUpdateSettings).not.toHaveBeenCalled();
    });

    it('calls onUpdateSettings with new values when save is clicked', () => {
        render(<Settings {...defaultProps} />);

        const userIdInput = screen.getByDisplayValue(mockSettings.lineUserId);
        const newUserId = 'U9999999999999999999999999999999';
        fireEvent.change(userIdInput, { target: { value: newUserId } });

        // 複数の保存ボタンがあるため、「設定を保存する」という完全なテキストを持つボタンを探す
        const saveButtons = screen.getAllByRole('button', { name: /保存/i });
        const saveButton = saveButtons.find(btn => btn.textContent?.includes('設定を保存する')) || saveButtons[0];
        fireEvent.click(saveButton);

        expect(mockOnUpdateSettings).toHaveBeenCalledWith({
            ...mockSettings,
            lineUserId: newUserId
        });

        // Success message should appear (複数の箇所に表示される可能性がある)
        expect(screen.getAllByText(/設定を保存しました/i).length).toBeGreaterThan(0);
    });

    it('resets changes when reset button is clicked and confirmed', () => {
        // Mock window.confirm
        const confirmSpy = vi.spyOn(window, 'confirm');
        confirmSpy.mockImplementation(() => true);

        render(<Settings {...defaultProps} />);

        const userIdInput = screen.getByDisplayValue(mockSettings.lineUserId);
        fireEvent.change(userIdInput, { target: { value: 'U9999999999999999999999999999999' } });

        // 複数の元に戻すボタンがあるため、最初のものを使用
        const resetButtons = screen.getAllByRole('button', { name: /元に戻す/i });
        const resetButton = resetButtons[0];
        fireEvent.click(resetButton);

        expect(confirmSpy).toHaveBeenCalled();
        // Should revert to original value
        expect(screen.getByDisplayValue(mockSettings.lineUserId)).toBeInTheDocument();
        // Save should not be called
        expect(mockOnUpdateSettings).not.toHaveBeenCalled();

        confirmSpy.mockRestore();
    });
});
