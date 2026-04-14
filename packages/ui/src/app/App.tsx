import React from 'react';

import './App.css';
import { Navigation } from './containers/navigation/Navigation';
import { Setup } from './containers/setup/Setup';
import { useAppSelector } from './hooks';

const App = (): JSX.Element => {
    const configLoaded: boolean = useAppSelector(state => state.config._configLoaded) ?? false;
    const isSetupComplete: boolean = useAppSelector(state => state.config.tutorial_is_done) ?? false;

    // Wait for server config before deciding setup vs dashboard
    if (!configLoaded) {
        return (<div />);
    }

    if (isSetupComplete) {
        return (<Navigation />);
    } else {
        return (<Setup />);
    }
};

export default App;
