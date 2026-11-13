package com.prakhar.squishh

import android.app.Application
import org.koin.android.ext.koin.androidContext
import org.koin.core.context.GlobalContext
import org.koin.core.context.startKoin

class SquishhApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        if (GlobalContext.getOrNull() == null) {
            startKoin {
                androidContext(this@SquishhApplication)
                modules(appModule)
            }
        }
    }
}
