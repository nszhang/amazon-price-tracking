// API Route for User Profile
// GET /api/user/profile - Get user profile
// PATCH /api/user/profile - Update user profile

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '@/lib/auth/config'
import { ProfilesService } from '@/lib/services/database/profiles-service'

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const profile = await ProfilesService.getProfile(session.user.id)

    return NextResponse.json({
      data: {
        email: session.user.email,
        ...profile,
      }
    })
  } catch (error) {
    console.error('Error fetching profile:', error)
    return NextResponse.json(
      { error: 'Failed to fetch profile' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    const profile = await ProfilesService.updateProfile(session.user.id, {
      full_name: body.full_name,
      alert_email: body.alert_email,
    })

    return NextResponse.json({ data: profile })
  } catch (error) {
    console.error('Error updating profile:', error)
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    )
  }
}
