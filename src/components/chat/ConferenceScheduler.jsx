import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Video, Plus } from "lucide-react";
import { toast } from "sonner";

export default function ConferenceScheduler({ channelId, currentUserId, currentUserName, transferTargets = [], onConferenceCreated, onClose }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleAddParticipant = (memberId) => {
    if (!selectedParticipants.find(p => p.id === memberId)) {
      const member = transferTargets.find(m => m.id === memberId);
      if (member) {
        setSelectedParticipants([...selectedParticipants, {
          id: member.id,
          name: member.full_name,
          email: member.email
        }]);
      }
    }
  };

  const handleRemoveParticipant = (memberId) => {
    setSelectedParticipants(selectedParticipants.filter(p => p.id !== memberId));
  };

  const handleSchedule = async () => {
    if (!title.trim() || !scheduledDate || !scheduledTime) {
      toast.error("Please fill in all required fields");
      return;
    }

    setLoading(true);
    try {
      // Get organizer info from localStorage (sales rep who's initiating)
      const organizerName = localStorage.getItem('sales_member_name') || currentUserName;
      const organizerEmail = localStorage.getItem('sales_member_email');
      const organizerId = localStorage.getItem('sales_member_id');

      const response = await base44.functions.invoke('scheduleConference', {
        title,
        description,
        scheduledDate,
        scheduledTime,
        durationMinutes,
        participants: selectedParticipants,
        channelId,
        organizerId,
        organizerName,
        organizerEmail
      });

      if (response?.data?.success) {
        toast.success("Conference scheduled and invites sent!");
        if (onConferenceCreated) {
          onConferenceCreated(response.data.conference);
        }
        onClose();
      } else {
        const errorMsg = response?.data?.error || response?.error || "Failed to schedule conference";
        console.error('Conference error:', errorMsg, response);
        toast.error(errorMsg);
      }
    } catch (error) {
      console.error('Error scheduling conference:', error);
      toast.error("Error: " + (error.message || "Failed to schedule conference"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-[#B8956A]" />
            <h2 className="text-xl font-semibold text-gray-900">Schedule Conference</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Conference Title *
            </label>
            <Input
              placeholder="e.g., Team Sync, Client Update"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              placeholder="Add details about the conference..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#B8956A]"
              rows="3"
            />
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date *
              </label>
              <Input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Time *
              </label>
              <Input
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
              />
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Duration (minutes)
            </label>
            <Input
              type="number"
              min="15"
              max="480"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(parseInt(e.target.value))}
            />
          </div>

          {/* Participants */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Invite Participants
            </label>
            
            {/* Add participant dropdown */}
            <select
              onChange={(e) => {
                if (e.target.value) {
                  handleAddParticipant(e.target.value);
                  e.target.value = "";
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#B8956A] mb-3"
            >
              <option value="">+ Add participant</option>
              {transferTargets
                .filter(m => m.id !== currentUserId && !selectedParticipants.find(p => p.id === m.id))
                .map(member => (
                  <option key={member.id} value={member.id}>
                    {member.full_name} ({member.email})
                  </option>
                ))}
            </select>

            {/* Selected participants */}
            <div className="space-y-2">
              {selectedParticipants.map(participant => (
                <div key={participant.id} className="flex items-center justify-between bg-gray-50 p-2 rounded-lg border border-gray-200">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{participant.name}</p>
                    <p className="text-xs text-gray-500">{participant.email}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveParticipant(participant.id)}
                    className="text-red-600 hover:bg-red-50"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 mt-6 pt-4 border-t">
          <Button
            variant="outline"
            onClick={onClose}
            disabled={loading}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSchedule}
            disabled={loading}
            className="flex-1 bg-[#B8956A] hover:bg-[#A68559] text-white"
          >
            {loading ? "Scheduling..." : "Schedule & Send Invites"}
          </Button>
        </div>
      </div>
    </div>
  );
}