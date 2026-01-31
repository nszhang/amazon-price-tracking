// User Registration API
// For creating new accounts in self-hosted setup

import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { ProfilesService } from '@/lib/services/database/profiles-service'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, password, full_name } = body

    console.log('[REGISTER] Request received:', { email, full_name, passwordLength: password?.length })

    // Validate input
    if (!email || !password) {
      console.log('[REGISTER] Validation failed: Missing email or password')
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      console.log('[REGISTER] Validation failed: Password too short')
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }

    // Check if user already exists
    console.log('[REGISTER] Checking if user exists:', email)
    const existingUser = await ProfilesService.getProfileByEmail(email)
    if (existingUser) {
      console.log('[REGISTER] User already exists:', email)
      return NextResponse.json(
        { error: 'User already exists' },
        { status: 409 }
      )
    }

    // Hash password
    console.log('[REGISTER] Hashing password')
    const password_hash = await bcrypt.hash(password, 10)

    // Create user
    console.log('[REGISTER] Creating user:', email)
    const user = await ProfilesService.createUser({
      email,
      password_hash,
      full_name,
    })

    console.log('[REGISTER] User created successfully:', user.id)
    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
      }
    })
  } catch (error) {
    console.error('[REGISTER] Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      error: error
    })
    return NextResponse.json(
      { error: 'Failed to create account' },
      { status: 500 }
    )
  }
}
