import { supabase } from '@/lib/supabase'
import type { Team, TeamMember, TeamWithMembers } from '@/types/database'

export async function getTeams(): Promise<TeamWithMembers[]> {
  const { data, error } = await supabase
    .from('teams')
    .select(`
      *,
      members:team_members(
        *,
        staff:staff(id, full_name, role, phone)
      )
    `)
    .order('name')
  if (error) throw error
  return data as unknown as TeamWithMembers[]
}

export async function createTeam(name: string): Promise<Team> {
  const { data, error } = await supabase
    .from('teams')
    .insert({ name })
    .select()
    .single()
  if (error) throw error
  return data as Team
}

export async function updateTeam(id: string, name: string): Promise<Team> {
  const { data, error } = await supabase
    .from('teams')
    .update({ name })
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Team
}

export async function deleteTeam(id: string): Promise<void> {
  const { error } = await supabase
    .from('teams')
    .delete()
    .eq('id', id)
  if (error) throw error
}

export async function addTeamMember(teamId: string, staffId: string): Promise<TeamMember> {
  const { data, error } = await supabase
    .from('team_members')
    .insert({ team_id: teamId, staff_id: staffId })
    .select()
    .single()
  if (error) throw error
  return data as TeamMember
}

export async function removeTeamMember(teamId: string, staffId: string): Promise<void> {
  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('staff_id', staffId)
  if (error) throw error
}

export async function updateTeamMembers(teamId: string, staffIds: string[]): Promise<void> {
  // First, delete all current members
  const { error: deleteError } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
  if (deleteError) throw deleteError

  if (staffIds.length === 0) return

  // Insert new members
  const inserts = staffIds.map(staffId => ({
    team_id: teamId,
    staff_id: staffId
  }))

  const { error: insertError } = await supabase
    .from('team_members')
    .insert(inserts)
  if (insertError) throw insertError
}
