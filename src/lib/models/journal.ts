export type Entries = {
    id?: string
    entry1: string
    entry2: string
    entry3: string
}

export type Entry = {
    id?: string
    entry: string
    index: number
    gsi1: string
    _sk: string
    _pk: string
}

export type EntryLike = {
    _pk: string
    _sk: string

    creatorId: string
    id: string
    index: number
    likedById: string
    value: number

    _ttl?: number
    gsi1?: string
}

export type InfluenceScore = {
    _pk: string
    _sk: string
    score: number
}

export type Streak = {
    _pk: string // userid
    _sk: string // STREAK

    streakStartDate: string
    streakEndDate: string

    maxStreak: number
    currentStreak: number
}