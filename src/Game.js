import React from 'react';
// import PropTypes from 'prop-types';
import DraggableCard from './draggable_card';
// import MultiBackend, { Preview } from 'react-dnd-multi-backend';
// import HTML5toTouch from 'react-dnd-multi-backend/dist/esm/HTML5toTouch';
import TouchBackend from 'react-dnd-touch-backend'
import { DndProvider } from 'react-dnd';
import MyCardsDropZone from './my_cards_drop_zone';
import PlayerDrop from './player_drop';
import CardWrap from './card_wrap';
import BlankPlayerCard from './blank_player_card';
import BlackCardDrop from './black_card_drop';
// import GeneratePreview from './generate_preview';
import { MAX_PLAYERS } from './data';
import { withRouter } from 'react-router-dom'
import styled from 'styled-components';
import io from 'socket.io-client';
import axios from 'axios';
import queryString from 'query-string';
import { SERVER_URL } from './helpers';
import './Game.css';

var socketIP = SERVER_URL
var socket = io(socketIP);

export const BlackCard = React.memo(({ text, setUserIsDragging }) => {
  return (
    <DraggableCard isFlipBroadcasted setUserIsDragging={setUserIsDragging} socket={socket} type="blackCard" bgColor="#000" color="#fff" text={text} />
  )
})

const PickUpPile = React.memo(({ id, text, setUserIsDragging }) => {
  return (
    <DraggableCard isFlippable={false} setUserIsDragging={setUserIsDragging} socket={socket} id={id} type="whiteCard" bgColor="#fff" color="#000" text={text} />
  )
})

class Game extends React.PureComponent {
  componentDidMount() {

    const newPlayers = [...this.state.players, { socket: socket.io }];

    this.setState({
      cardDimensions: {
        width: this.blackCardRef.current.offsetWidth,
        height: this.blackCardRef.current.offsetHeight
      },
      players: newPlayers,
    });

    // if (socket) {
    //   socket.emit('join room');

    //   socket.on('joined a room', theRoom => {
    //     console.log({theRoom});
    //   })
    // }

    const deckQueryString = queryString.parse(this.props.location.search).deck;

    // If the whiteCards and blackCards are already set, don't bother hitting this endpoint.
    if (!this.state.whiteCards.length && !this.state.blackCards.length) {
      axios.post(`${SERVER_URL}/api/getInitialCards`, { deckName: deckQueryString })
        .then(res => {
          if (!res.data) {
            return;
          }

          const { blackCards: newBlackCards, whiteCards: newWhiteCards } = res.data;

          socket.emit('set initialCards for game', { whiteCards: newWhiteCards, blackCards: newBlackCards });
        });
    }

    socket.on('get initialCards for game', ({ whiteCards = [], blackCards = [] }) => {
      this.setState({
        whiteCards,
        blackCards
      })
    });

    socket.on('disconnect', () => {
      this.setState({ showNamePopup: true, nameError: 'You were disconnected. Please rejoin.' });
    });

    // when a player changes their name, update players state with new name
    socket.on('name change', players => {
      this.setState({ players });
    });

    // when a player disconnects from the server, remove them from state
    socket.on('user disconnected', players => {
      this.setState({ players });
    });

    // when a new user connects
    // send that specific user the latest server states
    socket.on('new connection', ({ players, blackCards, whiteCards, submittedCards }) => {
      if (whiteCards && whiteCards.length > 0) {
        this.setState({ whiteCards });
      }

      if (blackCards && blackCards.length > 0) {
        this.setState({ blackCards });
      }

      if (submittedCards && submittedCards.length > 0) {
        this.setState({ submittedCards });
      }

      this.setState(() => ({ players, showNamePopup: true }));
    });

    // when a new user connects, let every client know.
    socket.on('user connected', players => {
      this.setState({ players });
    });

    socket.on('dropped in my cards', ({ players, whiteCards }) => {
      this.setState({ whiteCards, players, });
    });

    socket.on('update players', players => {
      this.setState({ players });
    });

    socket.on('update submittedCards', submittedCards => {
      this.setState({ submittedCards });
    });

    socket.on('submitted a card', ({ submittedCards, players }) => {
      this.setState({ submittedCards, players });
    });

    socket.on('player rejoins', players => {
      const playerWithWhiteCards = players.find(player => socket.id === player.id);
      if (playerWithWhiteCards.whiteCards) {
        this.setState({ myCards: playerWithWhiteCards.whiteCards })
      }

      this.setState({ players });
    })

    socket.on('dropped in player drop', ({ players, blackCards }) => {
      this.setState({ players, blackCards });
    });

    socket.on('restart game', (_) => {
      const newPlayers = this.state.players.map(player => {
        const newPlayer = { ...player };
        if (player.whiteCards && player.whiteCards.length) {
          delete newPlayer.whiteCards;
        }
        if (player.blackCards && player.blackCards.length) {
          delete newPlayer.blackCards;
        }

        return newPlayer;
      });
      this.setState({ whiteCards: [], blackCards: [], submittedCards: [], myCards: [], players: newPlayers });
      socket.emit('restart game', { whiteCards: [], blackCards: [], players: newPlayers });
    });
  }

  componentDidUpdate(prevProps, prevState) {
    if (prevState.players !== this.state.players) {
      const lengths = this.state.players.map(player => player.blackCards ? player.blackCards.length : -1);
      const winner = Math.max(...lengths);
      const numberOfWinners = lengths.filter(length => length === winner).length;
      const index = this.state.players.findIndex(player => player.blackCards && player.blackCards.length === winner);
      if (winner === 0 || numberOfWinners > 1) {
        return this.setState({ winningPlayerIndex: -1 });
      }
      this.setState({ winningPlayerIndex: index });
    }
  }

  componentWillUnmount() {
    socket.off('name change');
    socket.off('user disconnected');
    socket.off('new connection');
    socket.off('user connected');
    socket.off('dropped in my cards');
    socket.off('update players');
    socket.off('update submittedCards');
    socket.off('submitted a card');
    socket.off('player rejoins');
    socket.off('dropped in player drop');
    socket.off('restart game');
  }

  state = {
    blackCardWidth: null,
    blackCards: [],
    whiteCards: [],
    myCards: [],
    myName: localStorage.getItem('cas-name') || '',
    players: [],
    submittedCards: [],
    currentHost: 0,
    showNamePopup: true,
    userIsDragging: false,
    nameError: '',
    winningPlayerIndex: -1,
  }

  blackCardRef = React.createRef();

  getTheCurrentHost = index => this.setState({ currentHost: index });

  addCardToPlayer = (passedInCard, playerDroppedOn) => {

    if (!this.state.userIsDragging) {
      return;
    }

    // get the players state, the player index, and give that the passedInCard (players[index].blackCards.push(passedInCard))
    this.setState(prevState => {

      // update player card property with new card
      const newPlayers = [...prevState.players].map(player => {
        if (player.id === playerDroppedOn.id) {
          if (playerDroppedOn.blackCards && playerDroppedOn.blackCards.length) {
            // check if blackCard already exists with player
            if (!player.blackCards.some(blackCard => blackCard.text === passedInCard.text)) {
              player.blackCards = [...player.blackCards, { ...passedInCard }];
            }

          } else {
            player.blackCards = [{ ...passedInCard }];
          }
        } else {
          if (player.blackCards) {
            // if another player already has the blackCard, remove it from them
            player.blackCards = player.blackCards.filter(blackCard => {
              if (blackCard.text !== passedInCard.text) {
                return blackCard;
              }
            });
          }
        }
        return player;
      });

      // remove blackcard from blackcards if this is from the main deck
      // and not from another player slot ('blackCardFromPlayer')
      if (passedInCard.type === 'blackCard') {
        const indexOfPassedInCard = prevState.blackCards.findIndex(blackCard => blackCard === passedInCard.text);
        const newBlackCards = [...prevState.blackCards];
        newBlackCards.splice(indexOfPassedInCard, 1);

        return {
          players: newPlayers,
          blackCards: newBlackCards,
        };
      }

      return {
        players: newPlayers,
      };
    }, () => {
      // send event that a card was moved to someones deck to the server
      socket.emit('dropped in player drop', { players: this.state.players, blackCards: this.state.blackCards });
    });

  }

  addCardToMyCards = passedInCard => {
    if (this.state.myCards.length === 7 || !this.state.userIsDragging) {
      return;
    }

    this.setState(prevState => ({
      myCards: [...prevState.myCards, passedInCard],
    }));

    // send event that a card was moved to someones deck to the server
    socket.emit('dropped in my cards', { passedInCard, socketId: socket.id });
  }

  addBlackCardBackToPile = passedInCard => {
    if (!this.state.userIsDragging) {
      return;
    }
    // add passedInCard to the front of the blackCards array
    const newBlackCards = [...this.state.blackCards];
    newBlackCards.unshift(passedInCard);

    // find player with blackCard and remove from their blackCards array
    const newPlayers = this.state.players.map(player => {
      if (player.blackCards && player.blackCards.length) {
        const newPlayerBlackCards = player.blackCards.filter(blackCard => {
          return blackCard.text !== passedInCard.text
        });

        return { ...player, blackCards: newPlayerBlackCards };
      }

      return player;
    });

    this.setState({
      blackCards: newBlackCards,
      players: newPlayers,
    });

    // update blackCards for everyone
    socket.emit('dropped in player drop', { blackCards: newBlackCards, players: newPlayers });

  };

  submitACard = passedInCard => {
    if (this.state.submittedCards.length === MAX_PLAYERS - 1) {
      return;
    }

    // remove passedInCard from myCards
    const passedInCardIndex = this.state.myCards.findIndex(card => card.text === passedInCard.text);
    const newMyCards = [...this.state.myCards];
    newMyCards.splice(passedInCardIndex, 1);

    // update players and myCards
    this.setState({
      myCards: newMyCards,
    });

    socket.emit('submitted a card', { socketId: socket.id, passedInCard, newMyCards });
  };

  discardACard = passedInCard => {
    if (!this.state.userIsDragging) {
      return;
    }

    socket.emit('update submittedCards', passedInCard);
  }

  getBlankPlayerCards(players) {
    const length = MAX_PLAYERS - players.length;
    const arr = Array.from({ length }, (_, i) => i);

    return arr;
  }

  updateMyName = e => {
    const myName = e.target.value.toUpperCase().trim();
    this.setState({ myName });

    // send event that a user just changed their name
    socket.emit('name change', { id: socket.id, name: myName });
  };

  handleSubmit = e => {
    e.preventDefault();
    if (!socket.connected) {
      this.setState({ nameError: 'Cannot connect to server. Try again.' });
      return;
    }
    if (this.state.myName.trim().length < 2) {
      this.setState({ nameError: 'Please submit a name at least 2 characters long.' });
      return;
    }

    if (this.state.players.find(player => player.name === this.state.myName)) {
      this.setState({ nameError: 'Name taken. Please choose another name.' });
      return;
    }
    localStorage.setItem('cas-name', this.state.myName);
    this.setState(prevState => {
      // once we update our name, let's update our player in players
      const newPlayers = prevState.players.map(player => {
        if (player.id === socket.id) {

          const newPlayer = { ...player };
          newPlayer.name = this.state.myName;
          return newPlayer;
        }
        return player;
      });

      // and then let the other clients know
      socket.emit('name submit', { players: newPlayers, myName: this.state.myName, id: socket.id });

      return {
        showNamePopup: false,
        players: newPlayers,
        nameError: '',
      }
    });

  }

  setUserIsDragging = bool => {
    this.setState({ userIsDragging: bool });
  };

  render() {
    return (
      <div className="Game">
        {this.state.showNamePopup && (
          <form className="Game-namePopup" onSubmit={e => this.handleSubmit(e)}>
            <div className="Game-namePopup-innerWrap">
              <label htmlFor="name">Enter your name:</label>
              <input type="text" id="name" maxLength="16" onChange={e => this.updateMyName(e)} defaultValue={this.state.myName} />
              {this.state.nameError && <p className="Game-namePopup-errorMsg">{this.state.nameError}</p>}
              <button type="submit">JOIN GAME</button>
            </div>
          </form>
        )}
        <DndProvider backend={TouchBackend} options={{ enableMouseEvents: true }}>
          <Table>
            <CardsWrap>
              <Piles>
                <CardWrap isPickUpPile innerRef={this.blackCardRef}>
                  <BlackCardDrop addBlackCardBackToPile={this.addBlackCardBackToPile}>
                    {this.state.blackCards.slice(Math.max(this.state.blackCards.length - (MAX_PLAYERS + 1), 0)).map((text, index) => (
                      <BlackCard
                        setUserIsDragging={this.setUserIsDragging}
                        key={text}
                        id={index}
                        text={text}
                        cardDimensions={this.state.cardDimensions}
                      />
                    ))}
                  </BlackCardDrop>
                </CardWrap>
                <CardWrap isPickUpPile>
                  {this.state.whiteCards.slice(Math.max(this.state.whiteCards.length - (MAX_PLAYERS + 1), 0)).map((text, index) => (
                    <PickUpPile
                      setUserIsDragging={this.setUserIsDragging}
                      key={text}
                      id={index}
                      text={text}
                    />
                  ))}
                </CardWrap>
              </Piles>
              <PlayerDecks className="Table-playerDecks">
                {this.state.players && this.state.players.map(({ name }, index) => (
                  <PlayerDrop
                    setUserIsDragging={this.setUserIsDragging}
                    userIsDragging={this.state.userIsDragging}
                    key={index}
                    index={index}
                    socket={socket}
                    addCardToPlayer={this.addCardToPlayer}
                    players={this.state.players}
                    myName={this.state.myName}
                    winningPlayerIndex={this.state.winningPlayerIndex}
                  />
                ))}
                {this.getBlankPlayerCards(this.state.players).map((num, index) => (
                  <BlankPlayerCard key={num} index={index} count={this.state.players.length} />
                ))}
              </PlayerDecks>

            </CardsWrap>
            <MyCardsDropZone setUserIsDragging={this.setUserIsDragging} blackCards={this.state.blackCards} userIsDragging={this.state.userIsDragging} socket={socket} discardACard={this.discardACard} addCardToMyCards={this.addCardToMyCards} submitACard={this.submitACard} submittedCards={this.state.submittedCards} myCards={this.state.myCards} myName={this.state.myName} />
          </Table>
        </DndProvider>
      </div>
    );
  }
}

const Table = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
`;

const Piles = styled.div`
  display: flex;
  width: calc(40% - .25em);
  justify-content: space-between;
  align-items: center;
  @media (min-width: 1600px) {
    margin-right: 2em;
  }
  @media (max-width: 500px) and (orientation: portrait) {
    width: 100%;
    margin: .5em 0;
    order: 1;
  }
`;

const PlayerDecks = styled.div`
  display: flex;
  flex-wrap: wrap;
  width: calc(60% - .25em);
  justify-content: center;
  align-content: center;
  margin-right: -.5em;
  font-size: .7rem;

  @media (max-width: 500px) and (orientation: portrait) {
    width: calc(100% + 1em);
    margin: .5em -.5em .5em;
  }
`;

const CardsWrap = styled.div`
  display: flex;
  flex-grow: 1;
  padding: 1em;
  justify-content: space-between;
  max-height: calc(100vh - 50px);

  @media (min-width: 1600px) {
    padding: 0;
  }

  @media (max-width: 500px) and (orientation: portrait) {
    max-height: none;
    flex-direction: column;
    width: 100%;
    justify-content: center;
  }
`;

export default withRouter(Game);
