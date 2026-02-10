import React, { useState } from "react";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { X, Save } from "lucide-react";

export default function JobForm({ job, onSave, onCancel }) {
  const [formData, setFormData] = useState(
    job || {
      title: "",
      type: "photo",
      description: "",
      location: "",
      date: "",
      start_time: "",
      duration_hours: "",
      pay_rate: "",
      status: "open",
      notes: "",
    }
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Card className="border-2 border-[#B8956A]/30 bg-white">
      <CardHeader className="border-b border-[#B8956A]/20">
        <CardTitle className="text-[#1A1A1A]">{job ? "Edit Job" : "Create New Job"}</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4 pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">Job Title *</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                required
                placeholder="e.g., Luxury Estate Photoshoot"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="type">Type *</Label>
              <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="photo">Photo</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                  <SelectItem value="photo_video">Photo + Video</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Location *</Label>
              <Input
                id="location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                required
                placeholder="e.g., Beverly Hills, CA"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="pay_rate">Pay Rate ($) *</Label>
              <Input
                id="pay_rate"
                type="number"
                min="0"
                step="0.01"
                value={formData.pay_rate}
                onChange={(e) => setFormData({ ...formData, pay_rate: parseFloat(e.target.value) })}
                required
                placeholder="500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="start_time">Start Time</Label>
              <Input
                id="start_time"
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                placeholder="10:00 AM"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration_hours">Duration (hours)</Label>
              <Input
                id="duration_hours"
                type="number"
                min="0"
                step="0.5"
                value={formData.duration_hours}
                onChange={(e) => setFormData({ ...formData, duration_hours: parseFloat(e.target.value) })}
                placeholder="3"
              />
            </div>

            {job && (
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open</SelectItem>
                    <SelectItem value="booked">Booked</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Provide details about the job..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Additional Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Any special requirements or notes..."
              rows={2}
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-3 border-t border-[#B8956A]/20 pt-6">
          <Button type="button" variant="outline" onClick={onCancel} className="border-[#1A1A1A]/20">
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button type="submit" className="bg-[#B8956A] hover:bg-[#A68559] text-white">
            <Save className="w-4 h-4 mr-2" />
            {job ? "Update Job" : "Create Job"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}